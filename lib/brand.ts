/**
 * Product name and description, referenced by every user-facing surface (header, page titles,
 * exports, invitations). Change the name here and nowhere else.
 *
 * Identifiers deliberately keep their original "the-plan" spelling: localStorage keys, the Inngest
 * app id, the encryption context in lib/crypto.ts, the test database name and the package name.
 * Renaming those would orphan stored preferences and, for the encryption context, make existing
 * encrypted values unreadable.
 */
export const APP_NAME = "The Great Merging";

export const APP_DESCRIPTION = "Two people answer the same questions separately, read one brief together, and write a plan they both keep.";
