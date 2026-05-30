# Student contract PDF templates (AcroForm)

| File | Language |
|------|----------|
| `student-jobstudent-nl.pdf` | Dutch |
| `student-jobstudent-fr.pdf` | French |

These fillable PDFs use the field names defined in `src/infrastructure/contracts/contract-template-fields.ts`.

**Signatures:** the official NL/FR templates use fixed signature **boxes** on page 2 (not fillable `signature_student` / `signature_employer` text fields). Drawn signatures are burned in as PNG images when the employer signs. Custom uploaded templates may still use AcroForm fields named `signature_student` and `signature_employer` for image placement.

## Regenerate

```bash
npm run contracts:generate-templates
```

## Upload to your business

1. **Settings → Integrations → Contract PDF templates**
2. Upload `student-jobstudent-nl.pdf` under Dutch (NL)
3. Upload `student-jobstudent-fr.pdf` under French (FR) if needed

Have your lawyer review the clause text before production use. The app fills the form fields automatically from worker and employer profiles.
