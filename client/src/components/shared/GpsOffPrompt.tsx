import { MapPinOff, RefreshCw, Smartphone } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export type GpsProblem = 'denied' | 'off' | 'timeout' | 'unsupported' | 'insecure' | null;

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isAndroid = () => /Android/i.test(navigator.userAgent);

/** "GPS is not turned on" sheet with device-specific steps and a retry button (like Blinkit / Swiggy). */
export default function GpsOffPrompt({ problem, onRetry, onClose, purpose = 'tracking' }: { problem: GpsProblem; onRetry: () => void; onClose: () => void; purpose?: 'tracking' | 'attendance' | 'pickup' }) {
  const att = purpose === 'attendance';
  const steps: string[] = problem === 'denied'
    ? isIOS()
      ? ['Open iPhone Settings → Privacy & Security → Location Services and turn it ON',
         'Scroll to your browser (Safari / Chrome) or the O3 app → choose "While Using the App"',
         'Turn on "Precise Location"', 'Come back here and tap "Try again"']
      : ['Tap the 🔒 / ⓘ icon next to the website address', 'Open Permissions → Location → Allow',
         'If you use the O3 app: Settings → Apps → O3 Car Spaa → Permissions → Location → Allow all the time / while using',
         'Come back here and tap "Try again"']
    : problem === 'insecure'
      ? ['This page was opened on a link without https, so the phone does not allow location here.',
         'Open the O3 app or the https://… website link, or type your address and drag the pin to your gate.']
    : problem === 'unsupported'
      ? ['This browser cannot share location. Please use Chrome on Android or Safari on iPhone, or the O3 app.']
      : isAndroid()
        ? ['Swipe down from the top of the screen', 'Tap the "Location" tile to turn GPS ON', 'Keep "Location accuracy" ON (Settings → Location)', 'Tap "Try again"']
        : isIOS()
          ? ['Open Control Centre / Settings → Privacy & Security → Location Services → ON', 'Tap "Try again"']
          : ['Turn on location services on your device', 'Allow this site to use your location', 'Tap "Try again"'];

  return (
    <Modal open={!!problem} onClose={onClose} title={problem === 'insecure' ? 'Location is not available on this link' : problem === 'denied' ? 'Location is not allowed' : 'GPS is not turned on'} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Not now</Button><Button icon={<RefreshCw size={14} />} onClick={onRetry}>Try again</Button></>}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <MapPinOff className="text-rose-600 shrink-0" size={28} />
          <p className="text-sm text-rose-900 font-semibold">
            {problem === 'insecure' ? 'Location needs the secure app or website link.'
              : problem === 'denied' ? (att ? 'Location permission is blocked. Attendance only works when your location shows you are at the studio.' : purpose === 'pickup' ? 'Location permission is blocked. Allow it so we can pick up your car from the right spot, or type the address.' : 'Location permission is blocked, so the customer cannot see where the car is.')
              : problem === 'timeout' ? 'Could not get a GPS fix. Move to an open area and keep GPS on.'
              : (att ? 'Your phone\'s location (GPS) is off. Turn it on to check in or out at the studio.' : 'Your phone\'s location (GPS) is switched off. Live tracking needs it.')}
          </p>
        </div>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>{s}
            </li>
          ))}
        </ol>
        {purpose === 'tracking' && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Smartphone size={12} /> Keep this screen open while driving so the location keeps updating.</p>}
      </div>
    </Modal>
  );
}

/** Map a GeolocationPositionError to our problem type. */
export function gpsProblemFrom(err: GeolocationPositionError): GpsProblem {
  if (err.code === 1) return 'denied';
  if (err.code === 3) return 'timeout';
  return 'off';
}
