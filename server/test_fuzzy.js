const { getServiceBreakdown } = require('./src/controllers/userPackagesController');
const pool = require('./src/config/db');

async function test() {
  const serviceBreakdown = [
    { service_name: "Car Wash Basic", total_count: 5 },
    { service_name: "Ceramic Coating", total_count: 1 },
    { service_name: "Teflon Coating", total_count: 1 },
    { service_name: "Interior Detailing", total_count: 1 }
  ];
  
  const serviceNamesToTest = ["Car Wash", "Foam Wash", "Ceramic Coating", "Teflon Coating", "Interior", "AC Service"];
  
  for (const requested of serviceNamesToTest) {
    let serviceEntry = serviceBreakdown.find(s => s.service_name.toLowerCase().trim() === requested.toLowerCase().trim());
    if (!serviceEntry) {
        serviceEntry = serviceBreakdown.find(s => {
          const dbName = s.service_name.toLowerCase();
          const reqName = requested.toLowerCase();
          return dbName.includes(reqName) || reqName.includes(dbName) || 
                 (reqName.includes("wash") && dbName.includes("wash"));
        });
    }
    console.log(`Requested: ${requested} => Found:`, serviceEntry ? serviceEntry.service_name : "NOT FOUND");
  }
}
test();
