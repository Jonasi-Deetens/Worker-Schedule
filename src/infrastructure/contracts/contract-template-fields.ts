/**
 * AcroForm field names expected on uploaded Belgian student contract templates.
 * Designers should name PDF form fields exactly as listed here.
 */
export const CONTRACT_TEMPLATE_FIELDS = {
  contractTitle: "contract_title",
  contractType: "contract_type",
  employerName: "employer_name",
  employerAddress: "employer_address",
  employerCbe: "employer_cbe",
  studentName: "student_name",
  studentNiss: "student_niss",
  studentAddress: "student_address",
  studentBirthDate: "student_birth_date",
  studentIban: "student_iban",
  studentEmergencyName: "student_emergency_name",
  studentEmergencyPhone: "student_emergency_phone",
  startDate: "start_date",
  endDate: "end_date",
  hourlyWage: "hourly_wage",
  schedule: "schedule",
  jobDescription: "job_description",
  signatureStudent: "signature_student",
  signatureEmployer: "signature_employer",
  signedAt: "signed_at",
} as const;

export type ContractTemplateFieldValues = Partial<
  Record<(typeof CONTRACT_TEMPLATE_FIELDS)[keyof typeof CONTRACT_TEMPLATE_FIELDS], string>
>;

/** All field names — useful for template authoring docs. */
export const CONTRACT_TEMPLATE_FIELD_NAMES = Object.values(CONTRACT_TEMPLATE_FIELDS);
