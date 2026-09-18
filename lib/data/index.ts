/**
 * lib/data: the only module that reads or writes PHI. Every access that crosses a user boundary
 * (a partner reading the other's rows, a job reading on the couple's behalf, an export, a share
 * link, a clinician) writes an audit_log row. Request handlers and jobs import from here and
 * never from db/ directly.
 */
export * from "./audit";
export * from "./users";
export * from "./responses";
export * from "./interpretation";
export * from "./color";
export * from "./brief_plan";
export * from "./llm";
export * from "./square_one";
export * from "./clinician";
export * from "./extended";
export * from "./biographer";
