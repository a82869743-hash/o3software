const pool = require('../config/db');
const notificationQueue = require('./notificationQueue');
const pdfService = require('./pdfService');

class NotificationService {
  /**
   * Interpolate variable placeholders like {{customer_name}}
   */
  interpolate(templateStr, variables = {}) {
    if (!templateStr) return '';
    let result = templateStr;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value !== undefined && value !== null ? String(value) : '');
    }
    return result;
  }

  /**
   * Fetch active template by event_trigger
   */
  async getTemplate(eventTrigger) {
    const [rows] = await pool.query(
      'SELECT * FROM v2_whatsapp_templates WHERE event_trigger = ? AND is_active = 1 LIMIT 1',
      [eventTrigger]
    );
    return rows[0] || null;
  }

  /**
   * Generic high-level notification dispatcher
   */
  async notify({
    eventTrigger,
    customerId = null,
    mobile = null,
    email = null,
    variables = {},
    channels = ['whatsapp'],
    attachmentUrl = null,
    attachmentPath = null,
    idempotencyKey = null,
    referenceType = null,
    referenceId = null,
    franchiseId = 1,
    customMessageBody = null
  }) {
    try {
      // 1. Resolve customer details if customerId provided but mobile/email not provided
      let recipientMobile = mobile;
      let recipientEmail = email;
      let customerName = variables.customer_name;

      if (customerId) {
        const [users] = await pool.query(
          'SELECT id, name, mobile, email, opt_out_promotional FROM users WHERE id = ?',
          [customerId]
        );
        if (users.length) {
          const user = users[0];
          if (!recipientMobile) recipientMobile = user.mobile;
          if (!recipientEmail) recipientEmail = user.email;
          if (!customerName) customerName = user.name;
          variables.customer_name = customerName;

          // Check promotional opt-out
          const promotionalEvents = ['PACKAGE_EXPIRY_REMINDER', 'WELCOME_MESSAGE', 'PAYMENT_REMINDER', 'SERVICE_REMINDER'];
          if (promotionalEvents.includes(eventTrigger) && user.opt_out_promotional === 1) {
            console.log(`[NotificationService] Customer #${customerId} opted out of promotional notifications for ${eventTrigger}`);
            return { success: true, opted_out: true };
          }
        }
      }

      // 2. Resolve template & humanized message variations
      const humanizer = require('../utils/humanizer');
      let templateName = eventTrigger || 'CUSTOM_NOTIFICATION';
      let template = null;
      if (eventTrigger) {
        template = await this.getTemplate(eventTrigger);
        if (template) templateName = template.template_name;
      }

      // Standard interpolated body (for Email / SMS)
      let standardMessageBody = customMessageBody;
      if (!standardMessageBody) {
        if (template) {
          standardMessageBody = this.interpolate(template.message_body, variables);
        } else {
          standardMessageBody = `Notification from O3 Car Spaa for ${customerName || 'valued customer'}.`;
        }
      }

      // Dynamic Humanized variation (specifically for WhatsApp to prevent bot/spam template detection)
      let whatsappMessageBody = null;
      if (customMessageBody) {
        whatsappMessageBody = humanizer.humanizeManualMessage(customMessageBody, customerName);
      } else if (eventTrigger) {
        whatsappMessageBody = humanizer.humanizeNotification(eventTrigger, variables, template ? template.message_body : null);
      } else {
        whatsappMessageBody = humanizer.humanizeManualMessage(standardMessageBody, customerName);
      }

      const results = [];

      // Email copy of important customer messages (bills, quotations, bookings, completion, packages, payments)
      // whenever the customer has an email — progress updates stay WhatsApp-only. EMAIL_COPIES=false turns it off.
      const EMAIL_WORTHY = /invoice|bill|quotation|booking|complete|package|payment|receipt|warranty|welcome/i;
      if (!channels.includes('email') && recipientEmail && process.env.EMAIL_ENABLED === 'true' && process.env.EMAIL_COPIES !== 'false'
          && EMAIL_WORTHY.test(`${eventTrigger || ''} ${templateName || ''} ${referenceType || ''}`)
          && !/PIPELINE|STAGE/i.test(`${eventTrigger || ''}`)) {
        channels = [...channels, 'email'];
      }

      // 3. Dispatch to requested channels
      for (const channel of channels) {
        if (channel === 'whatsapp' && !recipientMobile) continue;
        if (channel === 'email' && (!recipientEmail || process.env.EMAIL_ENABLED !== 'true')) continue;

        // Unique channel-specific idempotency key
        const channelKey = idempotencyKey ? `${idempotencyKey}_${channel}` : null;
        const channelBody = channel === 'whatsapp' ? whatsappMessageBody : standardMessageBody;

        const res = await notificationQueue.enqueueNotification({
          idempotency_key: channelKey,
          channel,
          customer_id: customerId,
          mobile: recipientMobile,
          email: recipientEmail,
          template_name: templateName,
          message_body: channelBody,
          attachment_url: attachmentUrl,
          attachment_path: attachmentPath,
          payload_json: { eventTrigger, variables },
          reference_type: referenceType,
          reference_id: referenceId,
          franchise_id: franchiseId
        });

        results.push({ channel, ...res });
      }

      return {
        success: true,
        dispatches: results
      };
    } catch (err) {
      console.error('[NotificationService] notify error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * 1. Warranty Autosend:
   * When a PPF or Coating job card is marked completed, generate warranty certificate and send by Gmail & WhatsApp
   */
  async handleWarrantyAutoSend(jobCardId) {
    try {
      console.log(`[WarrantyAutoSend] Checking eligibility for Job Card #${jobCardId}`);

      // 1. Fetch job card, vehicle, customer and services
      const [jcRows] = await pool.query(`
        SELECT jc.*, v.brand, v.model, v.registration_no,
               u.id AS customer_id, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
               f.name AS franchise_name
        FROM job_carts jc
        JOIN vehicles v ON jc.vehicle_id = v.id
        JOIN users u ON v.customer_id = u.id
        LEFT JOIN franchises f ON jc.franchise_id = f.id
        WHERE jc.id = ?
      `, [jobCardId]);

      if (!jcRows.length) {
        console.warn(`[WarrantyAutoSend] Job card #${jobCardId} not found`);
        return { success: false, reason: 'Job card not found' };
      }

      const jc = jcRows[0];

      // 2. Check services for PPF or Coating
      const [services] = await pool.query(`
        SELECT id, service_name
        FROM job_services
        WHERE job_cart_id = ?
      `, [jobCardId]);

      const warrantyEligibleRegex = /ppf|paint\s*protection|ceramic|coating|graphene|tpu/i;
      const eligibleServices = services.filter(s =>
        warrantyEligibleRegex.test(s.service_name || '')
      );

      if (!eligibleServices.length) {
        console.log(`[WarrantyAutoSend] Job card #${jobCardId} contains no PPF or Coating services. Skipping warranty generation.`);
        return { success: true, eligible: false, message: 'No PPF/Coating services in job card' };
      }

      const primaryService = eligibleServices[0];
      const serviceName = primaryService.service_name || primaryService.name || 'PPF Coating Service';
      const isPPF = /ppf|paint\s*protection/i.test(serviceName);
      const serviceType = isPPF ? 'PPF (Paint Protection Film)' : 'Ceramic Coating';
      const warrantyYears = isPPF ? 5 : 3;

      // 3. Check or create record in warranty_certificates
      const [existingCert] = await pool.query(
        'SELECT * FROM warranty_certificates WHERE job_card_id = ?',
        [jobCardId]
      );

      let certificate;
      const issueDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const expDateObj = new Date();
      expDateObj.setFullYear(expDateObj.getFullYear() + warrantyYears);
      const expiryDate = expDateObj.toISOString().slice(0, 10);

      if (existingCert.length > 0) {
        certificate = existingCert[0];
      } else {
        const certificateNo = `WC-${new Date().getFullYear()}-${String(jobCardId).padStart(5, '0')}`;
        const [insRes] = await pool.query(`
          INSERT INTO warranty_certificates
          (certificate_no, job_card_id, customer_id, vehicle_id, service_type, service_name,
           warranty_years, issue_date, expiry_date, vehicle_reg_no, vehicle_model, franchise_id, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
          certificateNo,
          jobCardId,
          jc.customer_id,
          jc.vehicle_id,
          serviceType,
          serviceName,
          warrantyYears,
          issueDate,
          expiryDate,
          jc.registration_no,
          `${jc.brand || ''} ${jc.model || ''}`.trim(),
          jc.franchise_id || 1
        ]);

        const [createdCert] = await pool.query('SELECT * FROM warranty_certificates WHERE id = ?', [insRes.insertId]);
        certificate = createdCert[0];
      }

      // 4. Generate Warranty Certificate PDF
      const pdfResult = await pdfService.generateWarrantyPdf({
        certificateNo: certificate.certificate_no,
        customerName: jc.customer_name,
        customerMobile: jc.customer_mobile,
        customerEmail: jc.customer_email,
        vehicleRegNo: jc.registration_no,
        vehicleBrand: jc.brand,
        vehicleModel: jc.model,
        serviceType: certificate.service_type,
        serviceName: certificate.service_name,
        warrantyYears: certificate.warranty_years,
        issueDate: certificate.issue_date,
        expiryDate: certificate.expiry_date,
        jobCardId,
        franchiseName: jc.franchise_name || 'O3 Car Spaa Elite Studio'
      });

      // Update certificate with PDF paths
      await pool.query(
        'UPDATE warranty_certificates SET pdf_path = ?, pdf_url = ? WHERE id = ?',
        [pdfResult.filePath, pdfResult.publicUrl, certificate.id]
      );

      // 5. Enqueue automated notifications for WhatsApp & Gmail (Email)
      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
      const fullCertUrl = `${baseUrl}${pdfResult.publicUrl}`;
      const vehDisplay = jc.registration_no || `${jc.brand || ''} ${jc.model || ''}`.trim();

      const notifResult = await this.notify({
        eventTrigger: 'WARRANTY_CERTIFICATE',
        customerId: jc.customer_id,
        mobile: jc.customer_mobile,
        email: jc.customer_email,
        variables: {
          customer_name: jc.customer_name || 'Valued Customer',
          service_type: certificate.service_type,
          vehicle_number: vehDisplay,
          certificate_no: certificate.certificate_no,
          warranty_years: certificate.warranty_years,
          expiry_date: new Date(certificate.expiry_date).toLocaleDateString('en-IN'),
          certificate_url: fullCertUrl
        },
        channels: ['whatsapp', 'email'],
        attachmentUrl: pdfResult.publicUrl,
        attachmentPath: pdfResult.filePath,
        idempotencyKey: `warranty_jc_${jobCardId}`,
        referenceType: 'warranty_certificate',
        referenceId: certificate.id,
        franchiseId: jc.franchise_id || 1
      });

      console.log(`[WarrantyAutoSend] ✅ Successfully processed warranty certificate for Job Card #${jobCardId} (Cert: ${certificate.certificate_no})`);
      return {
        success: true,
        eligible: true,
        certificateNo: certificate.certificate_no,
        pdfUrl: pdfResult.publicUrl,
        notifications: notifResult
      };

    } catch (err) {
      console.error('[WarrantyAutoSend] Error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * 2. Buy/Sell Bill Soft Copy:
   * Auto-sent on bill creation by WhatsApp & Email
   */
  async handleBuySellBillAutoSend(billId, billType = 'buy_sell') {
    try {
      console.log(`[BuySellBillAutoSend] Preparing soft copy for ${billType} #${billId}`);

      let billData;
      let partyName;
      let partyMobile;
      let partyEmail = null;
      let invoiceNo;
      let franchiseId = 1;

      if (billType === 'manual_bill') {
        const [mbRows] = await pool.query('SELECT * FROM manual_bills WHERE id = ?', [billId]);
        if (!mbRows.length) return { success: false, error: 'Manual bill not found' };
        const mb = mbRows[0];
        partyName = mb.customer_name || 'Customer';
        partyMobile = mb.customer_mobile;
        invoiceNo = `MB-${mb.id}`;
        franchiseId = mb.franchise_id || 1;

        if (mb.customer_id) {
          const [uRows] = await pool.query('SELECT email FROM users WHERE id = ?', [mb.customer_id]);
          if (uRows.length) partyEmail = uRows[0].email;
        }

        billData = {
          billId: mb.id,
          invoiceNumber: invoiceNo,
          type: 'manual_bill',
          partyName,
          partyMobile,
          productName: mb.description || 'Auto Detailing Service & Parts',
          quantity: 1,
          unitPrice: mb.subtotal || mb.grand_total,
          totalAmount: mb.subtotal || mb.grand_total,
          taxAmount: mb.gst_amount || 0,
          discountAmount: mb.discount_amount || 0,
          grandTotal: mb.grand_total,
          transactionDate: mb.created_at,
          note: mb.description
        };
      } else {
        const [bsRows] = await pool.query('SELECT * FROM buy_sell WHERE id = ?', [billId]);
        if (!bsRows.length) return { success: false, error: 'Buy/Sell record not found' };
        const bs = bsRows[0];
        partyName = bs.party_name;
        partyMobile = bs.party_mobile;
        invoiceNo = bs.invoice_number || `BS-${bs.id}`;
        franchiseId = bs.franchise_id || 1;

        billData = {
          billId: bs.id,
          invoiceNumber: invoiceNo,
          type: bs.type,
          partyName,
          partyMobile,
          productName: bs.product_name,
          quantity: bs.quantity,
          unitPrice: bs.unit_price,
          totalAmount: bs.total_amount,
          grandTotal: bs.total_amount,
          transactionDate: bs.transaction_date,
          note: bs.note
        };
      }

      // Generate Soft Copy PDF
      // same invoice design as the bill downloaded in the app
      const inv = require('./invoiceService');
      const buf = billType === 'manual_bill' ? (await inv.generateManualBillPDF(billId)).pdfBuffer : await inv.generateBuySellInvoicePDF(billId);
      const fsx = require('fs'); const pathx = require('path');
      const billsDir = pathx.join(__dirname, '..', '..', 'uploads', 'bills');
      fsx.mkdirSync(billsDir, { recursive: true });
      const fileName = `${String(invoiceNo).replace(/[^A-Za-z0-9_-]/g, '_')}_${Date.now()}.pdf`;
      fsx.writeFileSync(pathx.join(billsDir, fileName), buf);
      const pdfRes = { filePath: pathx.join(billsDir, fileName), fileName, publicUrl: `/uploads/bills/${fileName}` };
      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
      const fullBillUrl = `${baseUrl}${pdfRes.publicUrl}`;

      // Dispatch via WhatsApp & Email
      const notifRes = await this.notify({
        eventTrigger: 'BUY_SELL_BILL',
        customerId: null,
        mobile: partyMobile,
        email: partyEmail,
        variables: {
          customer_name: partyName || 'Valued Customer',
          product_name: billData.productName,
          quantity: billData.quantity,
          total_amount: billData.grandTotal,
          invoice_number: invoiceNo,
          bill_url: fullBillUrl
        },
        channels: ['whatsapp', 'email'],
        attachmentUrl: pdfRes.publicUrl,
        attachmentPath: pdfRes.filePath,
        idempotencyKey: `${billType}_bill_${billId}`,
        referenceType: billType,
        referenceId: billId,
        franchiseId
      });

      console.log(`[BuySellBillAutoSend] ✅ Successfully dispatched bill soft copy for #${billId}`);
      return {
        success: true,
        invoiceNumber: invoiceNo,
        pdfUrl: pdfRes.publicUrl,
        notifications: notifRes
      };

    } catch (err) {
      console.error('[BuySellBillAutoSend] Error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * 3. Booking Reminders on WhatsApp:
   * Configurable lead times (24h and 2h before).
   * Skipped if booking is cancelled, rejected, or reschedule_required.
   */
  async checkBookingReminders() {
    try {
      console.log('[BookingReminders] Scanning upcoming bookings for WhatsApp reminders...');

      // Reminder 1: 24h before (target window: 23h 45m to 24h 15m from now)
      // Reminder 2: 2h before (target window: 1h 45m to 2h 15m from now)
      const intervals = [
        {
          trigger: 'BOOKING_REMINDER_24H',
          keyPrefix: 'booking_reminder_24h',
          minHours: 23.75,
          maxHours: 24.25
        },
        {
          trigger: 'BOOKING_REMINDER_2H',
          keyPrefix: 'booking_reminder_2h',
          minHours: 1.75,
          maxHours: 2.25
        }
      ];

      let sentCount = 0;
      let skippedCount = 0;

      for (const interval of intervals) {
        // Query upcoming bookings with slot details
        // Note: strictly exclude cancelled, rejected, reschedule_required, expired
        const [bookings] = await pool.query(`
          SELECT b.id, b.status, b.customer_id, b.vehicle_id, b.slot_id, b.franchise_id,
                 s.slot_date, s.start_time,
                 u.name AS customer_name, u.mobile AS customer_mobile,
                 v.brand, v.model, v.registration_no
          FROM bookings b
          JOIN slots s ON b.slot_id = s.id
          JOIN users u ON b.customer_id = u.id
          LEFT JOIN vehicles v ON b.vehicle_id = v.id
          WHERE b.status NOT IN ('cancelled', 'rejected', 'reschedule_required', 'expired')
            AND TIMESTAMP(s.slot_date, s.start_time) BETWEEN
                DATE_ADD(NOW(), INTERVAL ? MINUTE) AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
        `, [Math.round(interval.minHours * 60), Math.round(interval.maxHours * 60)]);

        for (const booking of bookings) {
          // Double verify skip condition
          if (['cancelled', 'rejected', 'reschedule_required', 'expired'].includes(booking.status)) {
            skippedCount++;
            continue;
          }

          if (!booking.customer_mobile) continue;

          const vehDisplay = booking.registration_no || `${booking.brand || ''} ${booking.model || ''}`.trim() || 'your vehicle';
          // e.g. "Sat, 7 Nov at 10:00 AM"
          const dPart = booking.slot_date
            ? new Date(booking.slot_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
            : '';
          let tPart = '';
          if (booking.start_time) {
            const [hh, mm] = String(booking.start_time).split(':').map(Number);
            tPart = `${((hh + 11) % 12) + 1}:${String(mm || 0).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
          }
          const formattedSlot = [dPart, tPart].filter(Boolean).join(' at ');
          const idempotencyKey = `${interval.keyPrefix}_${booking.id}`;

          await this.notify({
            eventTrigger: interval.trigger,
            customerId: booking.customer_id,
            mobile: booking.customer_mobile,
            variables: {
              customer_name: booking.customer_name || 'Customer',
              vehicle_number: vehDisplay,
              slot_time: formattedSlot
            },
            channels: ['whatsapp'],
            idempotencyKey,
            referenceType: 'booking',
            referenceId: booking.id,
            franchiseId: booking.franchise_id || 1
          });

          sentCount++;
        }
      }

      console.log(`[BookingReminders] Scan complete. Dispatched: ${sentCount}, Skipped: ${skippedCount}`);
      return { sent: sentCount, skipped: skippedCount };
    } catch (err) {
      console.error('[BookingReminders] Scan error:', err);
      return { error: err.message };
    }
  }

  /**
   * 4. Optional status-change notification hook for the pipeline (used in Phase 6)
   */
  async notifyPipelineStageChange({
    entityType = 'job_card',
    entityId,
    fromStatus,
    toStatus,
    customerId,
    mobile,
    email,
    vehicleNumber = '',
    stageName = '',
    statusLabel = '',
    franchiseId = 1,
    metadata = {}
  }) {
    try {
      const idempotencyKey = `pipeline_${entityType}_${entityId}_${toStatus}`;
      const effectiveStage = stageName || toStatus;
      const effectiveLabel = statusLabel || toStatus;

      console.log(`[PipelineHook] Pipeline status change for ${entityType} #${entityId}: ${fromStatus} -> ${toStatus}`);

      return await this.notify({
        eventTrigger: 'PIPELINE_STATUS_UPDATE',
        customerId,
        mobile,
        email,
        variables: {
          entity_type: entityType.replace(/_/g, ' '),
          entity_id: entityId,
          vehicle_number: vehicleNumber || 'Vehicle',
          stage_name: effectiveStage,
          status_label: effectiveLabel,
          ...metadata
        },
        channels: ['whatsapp'],
        idempotencyKey,
        referenceType: entityType,
        referenceId: entityId,
        franchiseId
      });
    } catch (err) {
      console.error('[PipelineHook] Error in notifyPipelineStageChange:', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new NotificationService();
