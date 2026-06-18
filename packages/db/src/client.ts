export { db, sqlite } from "./connection";
import { seedJargonFromCsv } from "./jargon-seed";

seedJargonFromCsv();
