// Admin helpers used to expose CRUD wrappers over RAG-local `courses` and
// `chapters` tables. Both were removed when the RAG package moved to the
// shared lms-service Postgres — courses/modules are owned there now. If you
// need admin surface for RAG-only data (e.g. glossary), add it here.
export {}
