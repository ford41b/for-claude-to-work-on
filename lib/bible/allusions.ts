/**
 * Well-known biblical stories and passages referred to by name rather than by reference.
 * Matches become `kind: "allusion"` with medium confidence — they are inferred, never
 * presented as an explicit citation. Where a story appears in several Gospels, the most
 * commonly cited account is used and noted.
 */
export interface Allusion {
  /** Lower-case phrases (matched on word boundaries, straight/curly apostrophes normalized). */
  phrases: string[];
  osis: string;
  label: string;
}

export const ALLUSIONS: readonly Allusion[] = [
  { phrases: ["prodigal son", "lost son"], osis: "Luke.15.11-Luke.15.32", label: "The prodigal son" },
  { phrases: ["good samaritan"], osis: "Luke.10.25-Luke.10.37", label: "The good Samaritan" },
  { phrases: ["lost sheep"], osis: "Luke.15.3-Luke.15.7", label: "The lost sheep" },
  { phrases: ["lost coin"], osis: "Luke.15.8-Luke.15.10", label: "The lost coin" },
  { phrases: ["sermon on the mount"], osis: "Matt.5-Matt.7", label: "The Sermon on the Mount" },
  { phrases: ["beatitudes"], osis: "Matt.5.3-Matt.5.12", label: "The Beatitudes" },
  { phrases: ["lord's prayer", "our father prayer"], osis: "Matt.6.9-Matt.6.13", label: "The Lord's Prayer" },
  { phrases: ["david and goliath"], osis: "1Sam.17", label: "David and Goliath" },
  { phrases: ["burning bush"], osis: "Exod.3", label: "The burning bush" },
  { phrases: ["crossing of the red sea", "parting of the red sea", "parted the red sea"], osis: "Exod.14", label: "Crossing the Red Sea" },
  { phrases: ["ten commandments"], osis: "Exod.20.1-Exod.20.17", label: "The Ten Commandments" },
  { phrases: ["noah's ark", "noah and the ark"], osis: "Gen.6-Gen.9", label: "Noah and the flood" },
  { phrases: ["tower of babel"], osis: "Gen.11.1-Gen.11.9", label: "The tower of Babel" },
  { phrases: ["binding of isaac", "abraham and isaac"], osis: "Gen.22", label: "Abraham and Isaac" },
  { phrases: ["jonah and the whale", "jonah and the big fish", "jonah and the great fish"], osis: "Jonah.1-Jonah.2", label: "Jonah and the great fish" },
  { phrases: ["lions' den", "lions den", "den of lions"], osis: "Dan.6", label: "Daniel in the lions' den" },
  { phrases: ["fiery furnace"], osis: "Dan.3", label: "The fiery furnace" },
  { phrases: ["feeding of the five thousand", "feeding the five thousand", "feeding of the 5,000", "feeding the 5000"], osis: "John.6.1-John.6.14", label: "Feeding of the five thousand (John's account)" },
  { phrases: ["walking on water", "walked on water", "walks on water"], osis: "Matt.14.22-Matt.14.33", label: "Jesus walks on water (Matthew's account)" },
  { phrases: ["raising of lazarus", "raised lazarus"], osis: "John.11", label: "The raising of Lazarus" },
  { phrases: ["woman at the well"], osis: "John.4.1-John.4.42", label: "The woman at the well" },
  { phrases: ["zacchaeus"], osis: "Luke.19.1-Luke.19.10", label: "Zacchaeus" },
  { phrases: ["great commission"], osis: "Matt.28.16-Matt.28.20", label: "The Great Commission" },
  { phrases: ["road to emmaus"], osis: "Luke.24.13-Luke.24.35", label: "The road to Emmaus" },
  { phrases: ["road to damascus", "conversion of saul", "saul's conversion"], osis: "Acts.9.1-Acts.9.19", label: "Saul's conversion" },
  { phrases: ["day of pentecost"], osis: "Acts.2", label: "Pentecost" },
  { phrases: ["fruit of the spirit"], osis: "Gal.5.22-Gal.5.23", label: "The fruit of the Spirit" },
  { phrases: ["armor of god", "armour of god"], osis: "Eph.6.10-Eph.6.18", label: "The armor of God" },
  { phrases: ["love chapter"], osis: "1Cor.13", label: "The love chapter" },
  { phrases: ["hall of faith", "faith hall of fame"], osis: "Heb.11", label: "The hall of faith" },
  { phrases: ["parable of the sower"], osis: "Matt.13.1-Matt.13.23", label: "The parable of the sower" },
  { phrases: ["mustard seed"], osis: "Matt.13.31-Matt.13.32", label: "The mustard seed" },
  { phrases: ["parable of the talents"], osis: "Matt.25.14-Matt.25.30", label: "The parable of the talents" },
  { phrases: ["valley of dry bones", "dry bones"], osis: "Ezek.37.1-Ezek.37.14", label: "The valley of dry bones" },
  { phrases: ["elijah on mount carmel", "mount carmel"], osis: "1Kgs.18", label: "Elijah on Mount Carmel" },
  { phrases: ["the last supper"], osis: "Luke.22.7-Luke.22.23", label: "The Last Supper (Luke's account)" },
  { phrases: ["garden of gethsemane", "in gethsemane"], osis: "Matt.26.36-Matt.26.46", label: "Gethsemane (Matthew's account)" },
  { phrases: ["the shepherd's psalm"], osis: "Ps.23", label: "The shepherd's psalm" },
];

export interface AllusionMatch {
  allusion: Allusion;
  index: number;
  length: number;
}

export function findAllusions(text: string): AllusionMatch[] {
  const normalized = text.toLowerCase().replace(/[’‘]/g, "'");
  const matches: AllusionMatch[] = [];
  for (const allusion of ALLUSIONS) {
    for (const phrase of allusion.phrases) {
      const re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(normalized)) !== null) {
        matches.push({ allusion, index: m.index + (m[1]?.length ?? 0), length: phrase.length });
      }
    }
  }
  // One match per allusion (first occurrence).
  const seen = new Set<string>();
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((m) => {
      if (seen.has(m.allusion.osis)) return false;
      seen.add(m.allusion.osis);
      return true;
    });
}
