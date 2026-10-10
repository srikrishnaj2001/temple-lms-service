# Course content policy

Effective 10 October 2026, all demo, dummy, and published course material must come
from verified sources at **ISKCON Vrindavan, ISKCON Mayapur, ISKCON Juhu, or
Govardhan Ecovillage (GEV)**. A mention of a place in a title or transcript is not
proof that the material comes from that institution. Record the original source
and verify its affiliation before publishing or uploading to Gumlet.

The previous generic seeded courses and ISKCON Bangalore video mappings are
retired. The old `seed:local`, `seed:library`, and seed-video linking scripts refuse
to run. Their historical fixtures remain importable for unit tests; do not use
them to repopulate a database or restore the retired Gumlet asset IDs.

The **Reading Library** is separate: it continues to read the public catalogue
and documents from `https://templeinfo.org/api`. Course cleanup must not modify
that upstream library, its books, or its document endpoints.

Users, tenants, and role definitions are not course content. Preserve them during
catalogue maintenance. When retiring course media, check every video/audio
reference and delete only assets that are exclusively part of the removed content.
