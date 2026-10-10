'use strict';

// Keep historical fixtures importable for unit tests, but never publish them again.
module.exports = function rejectRetiredDemoData() {
  console.error('This demo catalogue has been retired. Only verified content from ISKCON Vrindavan, Mayapur, Juhu, or GEV may be published. See CONTENT_POLICY.md.');
  process.exit(1);
};
