const { insertFhirRecord, getFhirRecords } = require("../models/fhir.model");

exports.parseFhir = async (req, res) => {
  try {
    const data = req.body;

    if (!data) {
      return res.status(400).json({ error: "FHIR data is required" });
    }

    // Insert FHIR data into PostgreSQL
    const newRecord = await insertFhirRecord(data);

    res.status(201).json({ message: "FHIR data parsed and saved successfully!", data: newRecord });
  } catch (err) {
    console.error("❌ FHIR Parse Error:", err);
    res.status(500).json({ error: "Failed to parse FHIR data" });
  }
};

exports.getFHIRPatients = async (req, res) => {
  try {
    const records = await getFhirRecords();

    // Extract patient info from FHIR records with resourceType "Patient"
    const patients = records
      .filter(record => record.data.resourceType === "Patient")
      .map(record => {
        const patientData = record.data;
        return {
          id: record._id || record.id,
          first_name: patientData.name?.[0]?.given?.[0] || "",
          last_name: patientData.name?.[0]?.family || "",
          date_of_birth: patientData.birthDate || "",
          gender: patientData.gender || "",
          address: patientData.address?.[0]
            ? `${patientData.address[0].line?.join(" ") || ""} ${patientData.address[0].city || ""} ${patientData.address[0].state || ""} ${patientData.address[0].postalCode || ""}`
            : "",
          phone: patientData.telecom?.find(t => t.system === "phone")?.value || "",
          email: patientData.telecom?.find(t => t.system === "email")?.value || "",
        };
      });

    res.status(200).json(patients);
  } catch (err) {
    console.error("❌ Error fetching FHIR patients:", err);
    res.status(500).json({ error: "Failed to fetch FHIR patients" });
  }
};

exports.deleteFHIRPatient = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { deleteFhirRecord } = require("../models/fhir.model");
    await deleteFhirRecord(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting FHIR patient:", error);
    res.status(500).json({ message: "Failed to delete FHIR patient" });
  }
};
