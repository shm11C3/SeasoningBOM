import { seasoningBomDb } from "../../db/SeasoningBomDb";
import { createIndexedDbRepositories } from "./IndexedDbRepositories";

export const indexedDbRepositories = createIndexedDbRepositories(seasoningBomDb);
