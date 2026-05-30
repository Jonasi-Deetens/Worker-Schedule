/**
 * Generates NL and FR fillable student-contract PDF templates (AcroForm).
 * Run: npx tsx scripts/generate-contract-templates.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { CONTRACT_TEMPLATE_FIELDS as F } from "../src/infrastructure/contracts/contract-template-fields";
import { OFFICIAL_CONTRACT_SIGNATURE_LAYOUT } from "../src/infrastructure/contracts/contract-template-layout";

type Locale = "nl" | "fr";

const COPY: Record<
  Locale,
  {
    title: string;
    subtitle: string;
    parties: string;
    employer: string;
    student: string;
    terms: string;
    period: string;
    wage: string;
    schedule: string;
    job: string;
    clauses: string[];
    signatures: string;
    studentSign: string;
    employerSign: string;
    signedAtLabel: string;
    footer: string;
  }
> = {
  nl: {
    title: "OVEREENKOMST VOOR TEWERKSTELLING VAN STUDENTEN",
    subtitle:
      "(Arbeidsovereenkomst van bepaalde duur — model ter invulling. Laat goedkeuren door uw jurist/accountant.)",
    parties: "Partijen",
    employer: "Werkgever",
    student: "Student / werknemer",
    terms: "Arbeidsvoorwaarden",
    period: "Duur van de overeenkomst",
    wage: "Vergoeding (bruto uurloon)",
    schedule: "Werkrooster / uren",
    job: "Functieomschrijving",
    clauses: [
      "De student verklaart ingeschreven te zijn aan een onderwijsinstelling en een geldig Student@work-attest te bezitten.",
      "De overeenkomst is gesloten voor bepaalde duur en mag de wettelijke maximumduur van twaalf opeenvolgende maanden bij dezelfde werkgever niet overschrijden.",
      "De eerste drie werkdagen gelden als proefperiode waarin elke partij de overeenkomst kan beëindigen zonder opzeg of vergoeding.",
      "De student geniet het studentenstatuut met verminderde sociale bijdragen (solidariteitsbijdrage) zolang het contingent van 650 uur per jaar niet is overschreden.",
      "De werkgever verbindt zich ertoe de Dimona-aangifte en de wettelijke tijdregistratie na te leven.",
      "Deze overeenkomst wordt opgemaakt in twee exemplaren, waarvan één voor elke partij.",
    ],
    signatures: "Ondertekening",
    studentSign: "Handtekening student",
    employerSign: "Handtekening werkgever",
    signedAtLabel: "Ondertekend op",
    footer:
      "Elektronische ondertekening via Work Calendar. Dit document vervangt geen juridisch advies.",
  },
  fr: {
    title: "CONTRAT DE TRAVAIL POUR ÉTUDIANT",
    subtitle:
      "(Contrat à durée déterminée — modèle à compléter. Faire valider par votre juriste/comptable.)",
    parties: "Parties",
    employer: "Employeur",
    student: "Étudiant / travailleur",
    terms: "Conditions de travail",
    period: "Durée du contrat",
    wage: "Rémunération (salaire horaire brut)",
    schedule: "Horaire / heures",
    job: "Description de la fonction",
    clauses: [
      "L'étudiant déclare être inscrit dans un établissement d'enseignement et disposer d'une attestation Student@work valide.",
      "Le contrat est conclu à durée déterminée et ne peut excéder la durée maximale légale de douze mois consécutifs chez le même employeur.",
      "Les trois premiers jours de travail constituent une période d'essai pendant laquelle chaque partie peut rompre le contrat sans préavis ni indemnité.",
      "L'étudiant bénéficie du statut étudiant avec cotisations sociales réduites (cotisation de solidarité) tant que le contingent de 650 heures par an n'est pas dépassé.",
      "L'employeur s'engage à effectuer la déclaration Dimona et le respect de l'enregistrement légal du temps de travail.",
      "Le présent contrat est établi en deux exemplaires, dont un pour chaque partie.",
    ],
    signatures: "Signatures",
    studentSign: "Signature de l'étudiant",
    employerSign: "Signature de l'employeur",
    signedAtLabel: "Signé le",
    footer:
      "Signature électronique via Work Calendar. Ce document ne remplace pas un avis juridique.",
  },
};

function addTextField(
  page: PDFPage,
  form: ReturnType<PDFDocument["getForm"]>,
  name: string,
  x: number,
  y: number,
  width: number,
  height = 16,
  multiline = false,
) {
  const field = form.createTextField(name);
  field.addToPage(page, { x, y, width, height });
  field.setFontSize(9);
  if (multiline) {
    field.enableMultiline();
  }
}

async function buildLocaleTemplate(locale: Locale): Promise<Uint8Array> {
  const c = COPY[locale];
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const margin = 50;
  const pageWidth = 595.28;
  const contentWidth = pageWidth - margin * 2;
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;

  const draw = (text: string, size = 10, useBold = false) => {
    const lines = wrapText(text, 85);
    for (const line of lines) {
      if (y < 80) {
        page = doc.addPage([595.28, 841.89]);
        y = 800;
      }
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: useBold ? bold : font,
        color: rgb(0.1, 0.12, 0.16),
      });
      y -= size + 6;
    }
  };

  // Hidden/meta fields at top of first page (small, for auto-fill)
  addTextField(page, form, F.contractTitle, margin, 820, contentWidth, 14);
  addTextField(page, form, F.contractType, margin, 800, 200, 14);

  draw(c.title, 14, true);
  draw(c.subtitle, 8);
  y -= 8;

  draw(c.parties, 11, true);

  page.drawText(c.employer, { x: margin, y, size: 9, font: bold });
  y -= 14;
  addTextField(page, form, F.employerName, margin, y - 2, contentWidth);
  y -= 22;
  page.drawText(
    locale === "nl" ? "Adres" : "Adresse",
    { x: margin, y, size: 9, font: bold },
  );
  y -= 14;
  addTextField(page, form, F.employerAddress, margin, y - 2, contentWidth);
  y -= 22;
  page.drawText(
    locale === "nl" ? "Ondernemingsnummer (KBO)" : "Numéro d'entreprise (BCE)",
    { x: margin, y, size: 9, font: bold },
  );
  y -= 14;
  addTextField(page, form, F.employerCbe, margin, y - 2, 220);
  y -= 28;

  page.drawText(c.student, { x: margin, y, size: 9, font: bold });
  y -= 14;
  addTextField(page, form, F.studentName, margin, y - 2, contentWidth);
  y -= 22;
  page.drawText(
    locale === "nl" ? "Rijksregisternummer (NISS)" : "Numéro national (NISS)",
    { x: margin, y, size: 9, font: bold },
  );
  y -= 14;
  addTextField(page, form, F.studentNiss, margin, y - 2, 220);
  y -= 22;
  page.drawText(
    locale === "nl" ? "Adres" : "Adresse",
    { x: margin, y, size: 9, font: bold },
  );
  y -= 14;
  addTextField(page, form, F.studentAddress, margin, y - 2, contentWidth);
  y -= 22;
  page.drawText(
    locale === "nl" ? "Geboortedatum" : "Date de naissance",
    { x: margin, y, size: 9, font: bold },
  );
  y -= 14;
  addTextField(page, form, F.studentBirthDate, margin, y - 2, 120);
  y -= 22;
  page.drawText("IBAN", { x: margin, y, size: 9, font: bold });
  y -= 14;
  addTextField(page, form, F.studentIban, margin, y - 2, contentWidth);
  y -= 22;
  page.drawText(
    locale === "nl" ? "Contactpersoon bij nood" : "Personne à contacter en cas d'urgence",
    { x: margin, y, size: 9, font: bold },
  );
  y -= 14;
  addTextField(page, form, F.studentEmergencyName, margin, y - 2, contentWidth * 0.55);
  addTextField(
    page,
    form,
    F.studentEmergencyPhone,
    margin + contentWidth * 0.58,
    y - 2,
    contentWidth * 0.4,
  );
  y -= 32;

  draw(c.terms, 11, true);

  page.drawText(c.period, { x: margin, y, size: 9, font: bold });
  y -= 14;
  page.drawText(
    locale === "nl" ? "Van" : "Du",
    { x: margin, y, size: 9, font },
  );
  addTextField(page, form, F.startDate, margin + 28, y - 2, 100);
  page.drawText(
    locale === "nl" ? "tot" : "au",
    { x: margin + 140, y, size: 9, font },
  );
  addTextField(page, form, F.endDate, margin + 160, y - 2, 100);
  y -= 28;

  page.drawText(c.wage, { x: margin, y, size: 9, font: bold });
  y -= 14;
  addTextField(page, form, F.hourlyWage, margin, y - 2, 160);
  y -= 26;

  page.drawText(c.job, { x: margin, y, size: 9, font: bold });
  y -= 14;
  addTextField(page, form, F.jobDescription, margin, y - 2, contentWidth, 36, true);
  y -= 48;

  page.drawText(c.schedule, { x: margin, y, size: 9, font: bold });
  y -= 14;
  addTextField(page, form, F.schedule, margin, y - 2, contentWidth, 40, true);
  y -= 52;

  draw(locale === "nl" ? "Bijzondere bepalingen" : "Dispositions particulières", 10, true);
  for (const clause of c.clauses) {
    draw(`• ${clause}`, 8);
  }
  y -= 6;

  // Signature page with fixed layout (see contract-template-layout.ts)
  const sigPage = doc.addPage([595.28, 841.89]);
  const layout = OFFICIAL_CONTRACT_SIGNATURE_LAYOUT[locale];
  const ink = rgb(0.1, 0.12, 0.16);
  const border = rgb(0.75, 0.78, 0.82);

  sigPage.drawText(c.signatures, {
    x: margin,
    y: 760,
    size: 12,
    font: bold,
    color: ink,
  });

  const drawSigBox = (
    label: string,
    box: { x: number; y: number; width: number; height: number },
  ) => {
    sigPage.drawText(label, {
      x: box.x,
      y: box.y + box.height + 6,
      size: 9,
      font: bold,
      color: ink,
    });
    sigPage.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      borderColor: border,
      borderWidth: 1,
    });
  };

  drawSigBox(c.studentSign, layout.student);
  drawSigBox(c.employerSign, layout.employer);

  sigPage.drawText(c.signedAtLabel, {
    x: layout.signedAt.x,
    y: layout.signedAt.y + layout.signedAt.height + 6,
    size: 9,
    font: bold,
    color: ink,
  });
  addTextField(
    sigPage,
    form,
    F.signedAt,
    layout.signedAt.x,
    layout.signedAt.y,
    layout.signedAt.width,
    layout.signedAt.height,
  );

  sigPage.drawText(c.footer, {
    x: margin,
    y: 36,
    size: 7,
    font,
    color: rgb(0.45, 0.48, 0.52),
  });

  // Set default appearance for title field (filled by app)
  try {
    form.getTextField(F.contractTitle).setText(c.title);
    form.getTextField(F.contractType).setText("JOBSTUDENT");
  } catch {
    // ignore
  }

  return doc.save();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function main() {
  const outDir = path.join(process.cwd(), "assets", "contracts");
  await mkdir(outDir, { recursive: true });

  const nl = await buildLocaleTemplate("nl");
  const fr = await buildLocaleTemplate("fr");

  const nlPath = path.join(outDir, "student-jobstudent-nl.pdf");
  const frPath = path.join(outDir, "student-jobstudent-fr.pdf");

  await writeFile(nlPath, nl);
  await writeFile(frPath, fr);

  console.log("Written:", nlPath);
  console.log("Written:", frPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
