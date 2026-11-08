import { isStopword } from './stopwords.js';

interface AbbreviationGroup {
  readonly abbreviations: readonly string[];
  readonly meanings: readonly string[];
}

/*
 * Common clinical abbreviations with their German and English spellings. Kept small on
 * purpose: semantic search carries most abbreviations, this map covers the frequent ones
 * whose letters differ between the languages (VHF and AF) or that a short query is only
 * made of (ARCHITECTURE.md edge cases).
 */
const GROUPS: readonly AbbreviationGroup[] = [
  { abbreviations: ['AF', 'VHF'], meanings: ['atrial fibrillation', 'Vorhofflimmern'] },
  {
    abbreviations: ['COPD'],
    meanings: ['chronic obstructive pulmonary disease', 'chronisch obstruktive Lungenerkrankung'],
  },
  {
    abbreviations: ['CAD', 'KHK'],
    meanings: ['coronary artery disease', 'koronare Herzkrankheit'],
  },
  {
    abbreviations: ['MI', 'AMI'],
    meanings: ['myocardial infarction', 'Myokardinfarkt', 'Herzinfarkt'],
  },
  { abbreviations: ['HF'], meanings: ['heart failure', 'Herzinsuffizienz'] },
  { abbreviations: ['DM'], meanings: ['diabetes mellitus'] },
  { abbreviations: ['GDM'], meanings: ['gestational diabetes mellitus', 'Gestationsdiabetes'] },
  { abbreviations: ['CKD'], meanings: ['chronic kidney disease', 'chronische Nierenerkrankung'] },
  { abbreviations: ['AKI', 'ANV'], meanings: ['acute kidney injury', 'akutes Nierenversagen'] },
  {
    abbreviations: ['ARDS'],
    meanings: ['acute respiratory distress syndrome', 'akutes Lungenversagen'],
  },
  { abbreviations: ['TBI', 'SHT'], meanings: ['traumatic brain injury', 'Schädel-Hirn-Trauma'] },
  { abbreviations: ['MS'], meanings: ['multiple sclerosis', 'Multiple Sklerose'] },
  { abbreviations: ['PE', 'LAE'], meanings: ['pulmonary embolism', 'Lungenembolie'] },
  { abbreviations: ['DVT', 'TVT'], meanings: ['deep vein thrombosis', 'tiefe Venenthrombose'] },
  {
    abbreviations: ['DOAC', 'NOAK'],
    meanings: ['direct oral anticoagulant', 'direkte orale Antikoagulanzien'],
  },
  { abbreviations: ['CRC', 'KRK'], meanings: ['colorectal cancer', 'kolorektales Karzinom'] },
  { abbreviations: ['HCC'], meanings: ['hepatocellular carcinoma', 'hepatozelluläres Karzinom'] },
  {
    abbreviations: ['NSCLC'],
    meanings: ['non-small cell lung cancer', 'nicht-kleinzelliges Lungenkarzinom'],
  },
  {
    abbreviations: ['IBD', 'CED'],
    meanings: ['inflammatory bowel disease', 'chronisch entzündliche Darmerkrankung'],
  },
  {
    abbreviations: ['GERD'],
    meanings: ['gastroesophageal reflux disease', 'gastroösophageale Refluxkrankheit'],
  },
  { abbreviations: ['RA'], meanings: ['rheumatoid arthritis', 'rheumatoide Arthritis'] },
  {
    abbreviations: ['OSA', 'OSAS'],
    meanings: ['obstructive sleep apnea', 'obstruktive Schlafapnoe'],
  },
  {
    abbreviations: ['PCI'],
    meanings: ['percutaneous coronary intervention', 'perkutane Koronarintervention'],
  },
  {
    abbreviations: ['CABG'],
    meanings: ['coronary artery bypass grafting', 'aortokoronarer Bypass'],
  },
  {
    abbreviations: ['TAVI', 'TAVR'],
    meanings: [
      'transcatheter aortic valve implantation',
      'Transkatheter-Aortenklappenimplantation',
    ],
  },
  { abbreviations: ['ICU', 'ITS'], meanings: ['intensive care unit', 'Intensivstation'] },
  {
    abbreviations: ['ADHD', 'ADHS'],
    meanings: [
      'attention deficit hyperactivity disorder',
      'Aufmerksamkeitsdefizit-Hyperaktivitätsstörung',
    ],
  },
  {
    abbreviations: ['PTSD', 'PTBS'],
    meanings: ['posttraumatic stress disorder', 'posttraumatische Belastungsstörung'],
  },
  {
    abbreviations: ['MRI', 'MRT'],
    meanings: ['magnetic resonance imaging', 'Magnetresonanztomographie'],
  },
  { abbreviations: ['CT'], meanings: ['computed tomography', 'Computertomographie'] },
  { abbreviations: ['ECG', 'EKG'], meanings: ['electrocardiogram', 'Elektrokardiogramm'] },
  { abbreviations: ['BMI'], meanings: ['body mass index'] },
  { abbreviations: ['HPV'], meanings: ['human papillomavirus', 'humane Papillomviren'] },
];

const BY_ABBREVIATION: ReadonlyMap<string, AbbreviationGroup> = new Map(
  GROUPS.flatMap((group) => group.abbreviations.map((abbreviation) => [abbreviation, group])),
);

/** Two-letter abbreviations are ordinary words too ("ms", "pe"), so they count only in capitals. */
const MIN_LOWERCASE_LENGTH = 3;

function groupOf(word: string): AbbreviationGroup | undefined {
  const upper = word.toUpperCase();
  const group = BY_ABBREVIATION.get(upper);
  if (group === undefined) return undefined;
  if (word === upper) return group;
  return word.length >= MIN_LOWERCASE_LENGTH && !isStopword(word) ? group : undefined;
}

/**
 * Returns what the abbreviations among `words` stand for, in German and English, plus their
 * other-language abbreviations ("VHF" gives "atrial fibrillation", "Vorhofflimmern" and
 * "AF"). Words already in the query are not repeated.
 */
export function expandAbbreviations(words: readonly string[]): string[] {
  const present = new Set(words.map((word) => word.toUpperCase()));
  const expansions = new Set<string>();
  for (const word of words) {
    const group = groupOf(word);
    if (group === undefined) continue;
    for (const abbreviation of group.abbreviations) {
      if (!present.has(abbreviation)) expansions.add(abbreviation);
    }
    for (const meaning of group.meanings) expansions.add(meaning);
  }
  return [...expansions];
}
