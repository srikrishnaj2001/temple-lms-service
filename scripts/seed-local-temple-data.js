'use strict';

require('dotenv').config();
const { sequelize } = require('../models');
const { seedVideoForId } = require('../src/utils/gumlet-seed-assets');

sequelize.options.logging = false;

const TENANT_ID = '8daf17bc-7c43-44b7-ba3b-67d8a439e072';
const SIGNED_IN_EMAIL = 'srikrishna.jarugubilli2001@gmail.com';

// 40 distinct, real ISKCON/Hare-Krishna photos (Wikimedia Commons originals, freely
// licensed), re-hosted on R2 as 1200x675 (16:9) crops. Assigned round-robin per course
// below so courses don't all share the same handful of thumbnails.
const THUMBNAIL_POOL = [
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-315d960fab.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-a0fbce4be7.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-81d693657f.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-ba35ff1031.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-3684b6ad7a.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-5d66aa7155.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-55ea7149a2.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-8d6acf18f5.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-5878598198.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-2aab3afe25.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-f785b1d9db.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-79b7c4b611.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-b9b6f153e3.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-c468321f05.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-65708eaf0a.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-1dd326cfc5.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-62a37fd93e.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-a8458666d3.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-c0c6e25403.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-e3ef7159b5.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-4673064efc.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-fe132a44c5.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-458de38fc2.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-8ee11f5b6e.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-a8509172a7.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-791c6d1be6.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-30fc8a2fd5.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-c358cf9b0f.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-437a4c0821.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-24054b1043.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-d607c4cb57.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-945aa86088.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-1fbb852fe5.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-8f3dcda176.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-5b5e36a929.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-1ac8fd588e.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-a3da875e3a.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-ef34d914ac.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-d9039ec3de.jpg',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/thumbnails/course-thumb-bcba1a528b.jpg'
];

// Real, public-domain ISKCON/Vaishnava-related PDFs (Wikimedia Commons / Internet
// Archive originals), re-hosted on R2. Used for every RESOURCE row whose resourceType
// is PDF, since the old `templeinfo.org/resources/:id` links never resolved to a file.
const PDF_RESOURCE_POOL = [
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-54430e5fa0.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-30a28afde2.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-f558880016.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-1df2e6a5a7.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-08cf63a32b.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-cce5462e34.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-e36c39a15b.pdf',
  'https://pub-365e6c5c33944480b373cd70d00e3591.r2.dev/seed-assets/pdfs/resource-b7b543a824.pdf'
];

const baseCourses = [
  {
    id: 1,
    title: 'Temple Etiquette Foundations',
    description: 'A calm onboarding path for new volunteers covering darshan etiquette, sacred-space awareness, guest care, and daily temple rhythm.',
    modules: [
      {
        title: 'Entering Sacred Service',
        description: 'Understand the mood of service before stepping into the temple floor.',
        contents: [
          ['VIDEO', 'Welcome to Seva Orientation', 'A gentle introduction to volunteer service, humility, cleanliness, and the purpose of learning together.', 480000, 'youtube:5MgBikgcWnY'],
          ['RESOURCE', 'Darshan Etiquette Checklist', 'A one-page reference for greeting, silence, phone use, queues, and respectful movement inside the temple.'],
          ['ASSIGNMENT', 'Personal Seva Reflection', 'Write a short reflection on the kind of service mood you want to cultivate this month.'],
          ['EVENT', 'Saturday Volunteer Welcome Circle', 'A live orientation circle for new and returning volunteers.']
        ]
      },
      {
        title: 'Guest Care Basics',
        description: 'Learn how to welcome visitors with warmth, clarity, and steadiness.',
        contents: [
          ['VIDEO', 'Welcoming First-Time Visitors', 'How to guide guests without overwhelming them, answer simple questions, and create a peaceful first experience.', 620000, 'youtube:dQw4w9WgXcQ'],
          ['RESOURCE', 'Common Visitor Questions', 'Suggested responses for questions about arati, prasadam, books, donations, and class timings.'],
          ['ASSIGNMENT', 'Greeting Practice', 'Prepare a short, respectful greeting you can use at the welcome desk.']
        ]
      }
    ]
  },
  {
    id: 2,
    title: 'Prasadam Kitchen Service',
    description: 'Chef and kitchen-volunteer training for cleanliness, ingredient handling, offering readiness, serving flow, and prasadam distribution.',
    modules: [
      {
        title: 'Kitchen Cleanliness and Safety',
        description: 'Prepare the kitchen for sacred cooking with clear, repeatable safety habits.',
        contents: [
          ['VIDEO', 'Prasadam Kitchen Orientation', 'Walk through handwash stations, prep zones, allergen separation, and closing cleanup records.', 540000, 'youtube:ysz5S6PUM-U'],
          ['RESOURCE', 'Clean Station Setup Guide', 'Checklist for boards, knives, surfaces, handwash areas, hair coverings, and utensil placement.'],
          ['ASSIGNMENT', 'Allergen Labeling Drill', 'Practice labeling sample ingredients and separating allergen-sensitive items.'],
          ['EVENT', 'Kitchen Walkthrough with Lead Cook', 'Live walkthrough of the prep area and serving line before weekend service.']
        ]
      },
      {
        title: 'Offering and Serving Flow',
        description: 'Learn timing, coordination, and the respectful handoff from cooking to offering to serving.',
        contents: [
          ['VIDEO', 'From Prep to Offering', 'A practical overview of cooking timelines, communication with pujari teams, and prasadam readiness.', 720000, 'youtube:jNQXAC9IVRw'],
          ['RESOURCE', 'Serving Line Readiness Sheet', 'Checklist for trays, ladles, gloves, water stations, signage, and queue flow.'],
          ['ASSIGNMENT', 'Service Flow Scenario', 'Respond to a short scenario about late items, crowd flow, and calm communication.']
        ]
      }
    ]
  },
  {
    id: 3,
    title: 'Puja Preparation and Altar Care',
    description: 'Priest and altar-support training for item handling, flower preparation, altar readiness, and respectful coordination.',
    modules: [
      {
        title: 'Altar Readiness',
        description: 'Understand how to prepare items and space before a ceremony begins.',
        contents: [
          ['VIDEO', 'Altar Support Orientation', 'Introduction to handling items respectfully, keeping pathways clear, and supporting the pujari team.', 600000, 'youtube:ScMzIvxBSi4'],
          ['RESOURCE', 'Altar Item Preparation List', 'Reference list for lamps, flowers, water, cloths, plates, bells, and cleaning items.'],
          ['ASSIGNMENT', 'Preparation Sequence Practice', 'Arrange a sample preparation sequence for a morning arati support shift.']
        ]
      },
      {
        title: 'Flowers, Lamps, and Sacred Items',
        description: 'Learn careful handling and setup patterns for common puja-support tasks.',
        contents: [
          ['VIDEO', 'Handling Sacred Items with Care', 'How to move, clean, place, and return items while staying mindful and unhurried.', 660000, 'youtube:eIho2S0ZahI'],
          ['RESOURCE', 'Flower Garland Handling Notes', 'Quick notes for storage, handling, freshness, and offering coordination.'],
          ['EVENT', 'Morning Arati Prep Observation', 'Observe the preparation flow with a senior volunteer.']
        ]
      }
    ]
  },
  {
    id: 4,
    title: 'Book Table and Outreach',
    description: 'Training for volunteers who support book tables, visitor conversations, literature care, and follow-up.',
    modules: [
      {
        title: 'Book Table Presence',
        description: 'Create a welcoming table that invites questions without pressure.',
        contents: [
          ['VIDEO', 'Setting Up the Book Table', 'Layout, signage, care for books, and how to keep the table calm and approachable.', 510000, 'youtube:aqz-KE-bpKQ'],
          ['RESOURCE', 'Book Table Opening Checklist', 'Simple setup checklist for display, pricing notes, contact sheets, and closing count.'],
          ['ASSIGNMENT', 'Conversation Practice', 'Draft three gentle ways to answer a visitor asking where to begin reading.']
        ]
      }
    ]
  },
  {
    id: 5,
    title: 'Festival Volunteer Coordination',
    description: 'Role-neutral preparation for festivals, including crowd flow, announcements, volunteer handoffs, and closing duties.',
    modules: [
      {
        title: 'Festival Day Readiness',
        description: 'Know where to stand, how to communicate, and when to escalate issues.',
        contents: [
          ['VIDEO', 'Festival Seva Briefing', 'A practical briefing on guest movement, volunteer stations, prasadam queues, and lost-and-found protocol.', 840000, 'youtube:YE7VzlLtp-4'],
          ['RESOURCE', 'Volunteer Station Map', 'Reference map for entrances, shoe area, book table, prasadam, water, and first-aid points.'],
          ['EVENT', 'Festival Team Dry Run', 'Walk through the festival route and volunteer handoff points before the event.']
        ]
      },
      {
        title: 'Closing and Follow-Up',
        description: 'Wrap up service with accountability, gratitude, and clear next steps.',
        contents: [
          ['VIDEO', 'After-Service Reset', 'How to close stations, record incidents, clean spaces, and hand off unresolved items.', 430000, 'youtube:kJQP7kiw5Fk'],
          ['ASSIGNMENT', 'Closing Report Practice', 'Complete a sample closing report for a busy evening program.']
        ]
      }
    ]
  }
];

const learningTracks = [
  {
    category: 'beginner-seva',
    roleName: 'VOLUNTEER',
    thumbnail: 'etiquette',
    titles: [
      'First Day Volunteer Orientation',
      'Temple Room Awareness',
      'Respectful Darshan Flow',
      'Serving with Humility',
      'Daily Seva Rhythm',
      'Visitor Welcome Basics',
      'Cleanliness Before Service',
      'Silent Service Etiquette'
    ]
  },
  {
    category: 'temple-operations',
    roleName: 'TEMPLE_ADMIN',
    thumbnail: 'mayapur',
    titles: [
      'Daily Opening Checklist',
      'Temple Closing Coordination',
      'Lost and Found Desk Care',
      'Volunteer Shift Handoffs',
      'Room Readiness Standards',
      'Queue and Crowd Movement',
      'Service Desk Communication',
      'Weekly Operations Review'
    ]
  },
  {
    category: 'prasadam-and-kitchen',
    roleName: 'CHEF',
    thumbnail: 'kitchen',
    titles: [
      'Ingredient Receiving and Storage',
      'Offering-Ready Cooking Flow',
      'Prasadam Packing Standards',
      'Kitchen Team Briefing',
      'Serving Line Setup',
      'Allergen-Safe Prasadam Service',
      'Post-Service Kitchen Reset',
      'Festival Cooking Coordination'
    ]
  },
  {
    category: 'puja-devotional-practice',
    roleName: 'PRIEST',
    thumbnail: 'puja',
    titles: [
      'Morning Arati Preparation',
      'Sacred Item Handling',
      'Flower Service Foundations',
      'Lamp and Incense Readiness',
      'Altar Cleaning Standards',
      'Puja Room Coordination',
      'Festival Puja Support',
      'Deity Seva Mindfulness'
    ]
  },
  {
    category: 'outreach-community',
    roleName: 'BOOK_TABLE',
    thumbnail: 'books',
    titles: [
      'Book Table Opening Flow',
      'Gentle Visitor Conversations',
      'Literature Care and Display',
      'Follow-Up Note Taking',
      'Donation Desk Courtesy',
      'Street Harinam Support',
      'New Guest Pathways',
      'Community Program Hosting'
    ]
  },
  {
    category: 'festival-seva',
    roleName: 'FESTIVAL_VOLUNTEER',
    thumbnail: 'festival',
    titles: [
      'Festival Day Orientation',
      'Ratha Yatra Volunteer Flow',
      'Crowd Guidance and Signage',
      'Prasadam Queue Support',
      'Festival Announcement Desk',
      'Guest Safety During Festivals',
      'Festival Closing Duties',
      'Volunteer Appreciation Follow-Up'
    ]
  },
  {
    category: 'kirtan-and-programs',
    roleName: 'VOLUNTEER',
    thumbnail: 'kirtan',
    titles: [
      'Kirtan Hall Setup',
      'Sound Check Support',
      'Class Recording Basics',
      'Program Host Etiquette',
      'Guest Seating During Kirtan',
      'Instrument Care Checklist',
      'Evening Program Flow',
      'Sunday Feast Program Support'
    ]
  },
  {
    category: 'children-and-family',
    roleName: 'VOLUNTEER',
    thumbnail: 'garden',
    titles: [
      'Children Class Helper Basics',
      'Family Welcome Desk',
      'Activity Room Readiness',
      'Storytelling Support',
      'Parent Communication Basics',
      'Safe Movement for Children',
      'Festival Kids Area Setup',
      'Youth Seva Mentoring'
    ]
  },
  {
    category: 'cleaning-and-facilities',
    roleName: 'VOLUNTEER',
    thumbnail: 'mayapur',
    titles: [
      'Temple Floor Cleaning Standards',
      'Shoe Area Reset',
      'Restroom Readiness Seva',
      'Waste Sorting and Disposal',
      'Garden and Pathway Care',
      'Guest Area Maintenance',
      'Cleaning Supply Safety',
      'After-Program Facility Reset'
    ]
  },
  {
    category: 'devotional-study',
    roleName: 'VOLUNTEER',
    thumbnail: 'deity',
    titles: [
      'Bhagavad Gita Study Basics',
      'Srila Prabhupada Reading Circle',
      'Morning Class Listening Practice',
      'Applying Philosophy in Seva',
      'Question and Answer Facilitation',
      'Study Group Hosting',
      'Devotional Note Taking',
      'Scripture Reference Care'
    ]
  },
  {
    category: 'administration-and-care',
    roleName: 'TEMPLE_ADMIN',
    thumbnail: 'etiquette',
    titles: [
      'Volunteer Database Hygiene',
      'Announcement Writing Basics',
      'Course Content Review Flow',
      'Seva Role Assignment',
      'Attendance and Follow-Up',
      'Sensitive Guest Communication',
      'Admin Dashboard Routine',
      'Training Calendar Planning'
    ]
  },
  {
    category: 'media-and-communications',
    roleName: 'VOLUNTEER',
    thumbnail: 'festival',
    titles: [
      'Temple Photography Etiquette',
      'Event Recap Writing',
      'Social Post Review Basics',
      'Live Stream Support',
      'Audio Archive Care',
      'Newsletter Content Gathering',
      'Video Upload Checklist',
      'Design Asset Organization'
    ]
  }
];

function buildGeneratedModules(courseTitle, categoryName) {
  return [
    {
      title: `${courseTitle} Foundations`,
      description: `Build the service mood, vocabulary, and practical readiness for ${categoryName.toLowerCase()}.`,
      contents: [
        ['VIDEO', `${courseTitle} Overview`, `A calm introduction to the expectations, flow, and seva mood for ${courseTitle.toLowerCase()}.`, 420000, 'youtube:5MgBikgcWnY'],
        ['RESOURCE', `${courseTitle} Checklist`, `A short reference checklist for preparing before this service begins.`],
        ['ASSIGNMENT', `${courseTitle} Reflection`, `Write one action you will practice during your next seva shift.`]
      ]
    },
    {
      title: `${courseTitle} Practice`,
      description: `Practice the handoffs, communication, and closing habits that make service steady.`,
      contents: [
        ['VIDEO', `${courseTitle} Practice Walkthrough`, `A practical walkthrough of common scenarios and respectful responses.`, 540000, 'youtube:jNQXAC9IVRw'],
        ['RESOURCE', `${courseTitle} Scenario Notes`, `Reference notes for common questions, edge cases, and escalation moments.`],
        ['EVENT', `${courseTitle} Live Seva Circle`, `Join a short live review with the service lead before applying this in the temple.`]
      ]
    }
  ];
}

let generatedCourseId = 6;

const generatedCourses = learningTracks
  .flatMap((track) => track.titles.map((title, index) => {
    const category = track.category
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    const id = generatedCourseId++;
    return {
      id,
      title,
      description: `${category} training for volunteers who want a calm, practical, and devotional way to serve with confidence.`,
      roleName: track.roleName,
      categorySlugs: Array.from(new Set(index % 3 === 0 ? [track.category, 'beginner-seva'] : [track.category])),
      modules: buildGeneratedModules(title, category)
    };
  }));

const courses = [...baseCourses, ...generatedCourses].slice(0, 100);

// Assign thumbnails round-robin across the whole course list so consecutive courses
// (e.g. the 8 courses generated from one learning track) don't all share one image.
courses.forEach((course, index) => {
  course.thumbnailUrl = THUMBNAIL_POOL[index % THUMBNAIL_POOL.length];
});

const categories = [
  {
    name: 'Beginner Seva',
    slug: 'beginner-seva',
    description: 'Gentle starting points for volunteers entering regular temple service.',
    sequenceNumber: 1
  },
  {
    name: 'Temple Operations',
    slug: 'temple-operations',
    description: 'Practical training for keeping daily service organized, clean, and welcoming.',
    sequenceNumber: 2
  },
  {
    name: 'Prasadam and Kitchen',
    slug: 'prasadam-and-kitchen',
    description: 'Cooking, cleanliness, offering-readiness, and serving-line training for prasadam teams.',
    sequenceNumber: 3
  },
  {
    name: 'Puja and Devotional Practice',
    slug: 'puja-devotional-practice',
    description: 'Courses for altar support, sacred item care, and devotional readiness.',
    sequenceNumber: 4
  },
  {
    name: 'Outreach and Community',
    slug: 'outreach-community',
    description: 'Training for book tables, guest conversations, festivals, and public programs.',
    sequenceNumber: 5
  },
  {
    name: 'Festival Seva',
    slug: 'festival-seva',
    description: 'Preparation for festival days, crowd flow, announcements, and closing duties.',
    sequenceNumber: 6
  },
  {
    name: 'Kirtan and Programs',
    slug: 'kirtan-and-programs',
    description: 'Program hall, kirtan, sound, recording, and event-flow support for weekly gatherings.',
    sequenceNumber: 7
  },
  {
    name: 'Children and Family',
    slug: 'children-and-family',
    description: 'Gentle training for family welcome, children classes, and safe activity spaces.',
    sequenceNumber: 8
  },
  {
    name: 'Cleaning and Facilities',
    slug: 'cleaning-and-facilities',
    description: 'Facility care courses for clean, peaceful, and ready temple spaces.',
    sequenceNumber: 9
  },
  {
    name: 'Devotional Study',
    slug: 'devotional-study',
    description: 'Reading circles, class listening, and scripture study habits for steady seva.',
    sequenceNumber: 10
  },
  {
    name: 'Administration and Care',
    slug: 'administration-and-care',
    description: 'Admin workflows for volunteer care, communication, scheduling, and content upkeep.',
    sequenceNumber: 11
  },
  {
    name: 'Media and Communications',
    slug: 'media-and-communications',
    description: 'Photography, publishing, livestream, and archive practices for temple communication.',
    sequenceNumber: 12
  }
];

const courseCategories = {
  1: ['beginner-seva', 'temple-operations'],
  2: ['prasadam-and-kitchen', 'temple-operations'],
  3: ['puja-devotional-practice', 'beginner-seva'],
  4: ['outreach-community'],
  5: ['festival-seva', 'outreach-community']
};

for (const course of generatedCourses) {
  courseCategories[course.id] = course.categorySlugs;
}

const announcements = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    title: 'Weekend orientation starts at 9 AM',
    preview: 'Please arrive ten minutes early, collect your badge, and join the welcome circle before service begins.',
    image: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=1200'
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    title: 'Kitchen volunteers: updated cleanliness sheet',
    preview: 'The prasadam kitchen checklist now includes allergen labels, handwash reminders, and closing cleanup notes.',
    image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1200'
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    title: 'Festival briefing available in course content',
    preview: 'Please review the festival volunteer briefing before joining the Sunday team dry run.',
    image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=1200'
  }
];

function contentId(courseId, moduleIndex, contentIndex) {
  return courseId * 100 + moduleIndex * 10 + contentIndex;
}

async function upsert(query, replacements, transaction) {
  await sequelize.query(query, { replacements, transaction });
}

async function main() {
  const transaction = await sequelize.transaction();
  try {
    await upsert(`
      INSERT INTO tenants (id, domain, name, "createdAt", "updatedAt")
      VALUES (:id, 'templeinfo.localhost', 'TempleInfo Learning', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        domain = 'templeinfo.localhost',
        name = 'TempleInfo Learning',
        "updatedAt" = NOW()
    `, { id: TENANT_ID }, transaction);

    await upsert(`
      UPDATE tenants
      SET name = 'TempleInfo Learning', domain = 'templeinfo.localhost', "updatedAt" = NOW()
      WHERE id = :id
    `, { id: TENANT_ID }, transaction);

    const users = [
      ['Test Learner', 'learner@example.com', '+1-555-0100'],
      ['Admin User', 'admin@example.com', '+1-555-0199'],
      ['Sri Krishna Jarugubilli', SIGNED_IN_EMAIL, '+1-555-0102'],
      ['Gita Sharma', 'gita.sharma@example.com', '+1-555-0103'],
      ['Madhav Das', 'madhav.das@example.com', '+1-555-0104']
    ];

    for (const [name, email, phone] of users) {
      await upsert(`
        INSERT INTO users (name, email, phone, "createdAt", "updatedAt")
        VALUES (:name, :email, :phone, NOW(), NOW())
        ON CONFLICT (email, phone) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW(), "deletedAt" = NULL
      `, { name, email, phone }, transaction);
    }

    const roleNames = ['CHEF', 'PRIEST', 'TEMPLE_ADMIN', 'VOLUNTEER', 'BOOK_TABLE', 'FESTIVAL_VOLUNTEER'];
    for (const name of roleNames) {
      await upsert(`
        INSERT INTO roles (name, "createdAt", "updatedAt")
        VALUES (:name, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET "updatedAt" = NOW()
      `, { name }, transaction);
    }

    for (const category of categories) {
      await upsert(`
        INSERT INTO categories (name, slug, description, "sequenceNumber", "createdAt", "updatedAt")
        VALUES (:name, :slug, :description, :sequenceNumber, NOW(), NOW())
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "sequenceNumber" = EXCLUDED."sequenceNumber",
          "updatedAt" = NOW()
      `, category, transaction);
    }

    for (const course of courses) {
      await upsert(`
        INSERT INTO courses (id, title, description, "thumbnailUrl", "tenantId", "createdAt", "updatedAt")
        VALUES (:id, :title, :description, :thumbnailUrl, :tenantId, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          "thumbnailUrl" = EXCLUDED."thumbnailUrl",
          "tenantId" = EXCLUDED."tenantId",
          "updatedAt" = NOW()
      `, { ...course, tenantId: TENANT_ID }, transaction);

      const roleName = course.roleName || (course.title.includes('Kitchen')
        ? 'CHEF'
        : course.title.includes('Puja')
          ? 'PRIEST'
          : course.title.includes('Book')
            ? 'BOOK_TABLE'
            : course.title.includes('Festival')
              ? 'FESTIVAL_VOLUNTEER'
              : 'VOLUNTEER');

      await upsert(`
        INSERT INTO "courseRoles" ("courseId", "roleId", "createdAt", "updatedAt")
        SELECT :courseId, id, NOW(), NOW()
        FROM roles
        WHERE name = :roleName
        ON CONFLICT ("courseId", "roleId") DO UPDATE SET "updatedAt" = NOW()
      `, { courseId: course.id, roleName }, transaction);

      for (const [index, slug] of (courseCategories[course.id] || []).entries()) {
        await upsert(`
          INSERT INTO "courseCategories" ("courseId", "categoryId", "sequenceNumber", "createdAt", "updatedAt")
          SELECT :courseId, id, :sequenceNumber, NOW(), NOW()
          FROM categories
          WHERE slug = :slug
          ON CONFLICT ("courseId", "categoryId") DO UPDATE SET
            "sequenceNumber" = EXCLUDED."sequenceNumber",
            "updatedAt" = NOW()
        `, { courseId: course.id, slug, sequenceNumber: index + 1 }, transaction);
      }

      for (const [moduleZeroIndex, module] of course.modules.entries()) {
        const moduleIndex = moduleZeroIndex + 1;

        const [moduleRows] = await sequelize.query(`
          INSERT INTO modules (id, title, description, "courseId", "sequenceNumber", "startDate", "createdAt", "updatedAt")
          VALUES (:id, :title, :description, :courseId, :sequenceNumber, NOW() - INTERVAL '7 days', NOW(), NOW())
          ON CONFLICT ("courseId", "sequenceNumber") WHERE "deletedAt" IS NULL DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            "startDate" = EXCLUDED."startDate",
            "updatedAt" = NOW(),
            "deletedAt" = NULL
          RETURNING id
        `, {
          replacements: {
            id: course.id * 10 + moduleIndex,
            title: module.title,
            description: module.description,
            courseId: course.id,
            sequenceNumber: moduleIndex
          },
          transaction
        });
        const moduleId = moduleRows[0].id;

        for (const [contentZeroIndex, content] of module.contents.entries()) {
          const contentIndex = contentZeroIndex + 1;
          const [type, title, description, duration, externalId] = content;
          const polyId = contentId(course.id, moduleIndex, contentIndex);
          const rowId = contentId(course.id, moduleIndex, contentIndex);

          const storedType = type === 'VIDEO' ? 'VIDEO' : 'RESOURCE';

          if (type === 'VIDEO') {
            await upsert(`
              INSERT INTO videos (id, title, description, summary, transcript, external_resources, "externalVideoId", "durationMs", "createdAt", "updatedAt")
              VALUES (:id, :title, :description, :summary, NULL, CAST(:externalResources AS jsonb), :externalVideoId, :durationMs, NOW(), NOW())
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                summary = EXCLUDED.summary,
                transcript = EXCLUDED.transcript,
                external_resources = EXCLUDED.external_resources,
                "externalVideoId" = EXCLUDED."externalVideoId",
                "durationMs" = EXCLUDED."durationMs",
                "updatedAt" = NOW()
            `, {
              id: polyId,
              ...seedVideoForId(polyId),
              externalResources: JSON.stringify(seedVideoForId(polyId).externalResources)
            }, transaction);
          } else {
            const resourceType = type === 'EVENT' ? 'TEXT' : 'PDF';
            await upsert(`
              INSERT INTO resources (id, title, description, url, type, "createdAt", "updatedAt")
              VALUES (:id, :title, :description, :url, :resourceType, NOW(), NOW())
              ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, url = EXCLUDED.url, type = EXCLUDED.type, "updatedAt" = NOW()
            `, {
              id: polyId,
              title,
              description,
              url: resourceType === 'PDF'
                ? PDF_RESOURCE_POOL[polyId % PDF_RESOURCE_POOL.length]
                : `https://templeinfo.org/resources/${polyId}`,
              resourceType
            }, transaction);
          }

          await sequelize.query(`
            INSERT INTO contents (id, "contentId", "contentType", "sequenceNumber", "startDate", "moduleId", "createdAt", "updatedAt")
            VALUES (:id, :polyId, :type, :sequenceNumber, NOW() - INTERVAL '7 days', :moduleId, NOW(), NOW())
            ON CONFLICT ("moduleId", "sequenceNumber") WHERE "deletedAt" IS NULL DO UPDATE SET
              "contentId" = EXCLUDED."contentId",
              "contentType" = EXCLUDED."contentType",
              "startDate" = EXCLUDED."startDate",
              "updatedAt" = NOW(),
              "deletedAt" = NULL
            RETURNING id
          `, {
            replacements: {
              id: rowId,
              polyId,
              type: storedType,
              sequenceNumber: contentIndex,
              moduleId
            },
            transaction
          });
        }
      }

      await upsert(`
        UPDATE modules
        SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE "courseId" = :courseId
          AND "sequenceNumber" > :moduleCount
          AND "deletedAt" IS NULL
      `, { courseId: course.id, moduleCount: course.modules.length }, transaction);
    }

    const studentEmails = ['learner@example.com', SIGNED_IN_EMAIL, 'gita.sharma@example.com', 'madhav.das@example.com'];
    await sequelize.query(`
      SELECT setval('enrollments_id_seq', GREATEST((SELECT MAX(id) FROM enrollments), 1), true);
    `, { transaction });

    for (const email of studentEmails) {
      const [[user]] = await sequelize.query('SELECT id FROM users WHERE email = :email LIMIT 1', { replacements: { email }, transaction });
      for (const course of courses) {
        await upsert(`
          INSERT INTO enrollments ("userId", "courseId", "createdAt", "updatedAt")
          VALUES (:userId, :courseId, NOW(), NOW())
          ON CONFLICT ("courseId", "userId") WHERE "deletedAt" IS NULL DO UPDATE SET
            "updatedAt" = NOW(),
            "deletedAt" = NULL
        `, { userId: user.id, courseId: course.id }, transaction);
      }

      await upsert(`
        INSERT INTO "userRoles" ("userId", "roleId", "createdAt", "updatedAt")
        SELECT :userId, id, NOW(), NOW()
        FROM roles
        WHERE name = 'VOLUNTEER'
        ON CONFLICT ("userId", "roleId") DO UPDATE SET "updatedAt" = NOW()
      `, { userId: user.id }, transaction);
    }

    const [[adminUser]] = await sequelize.query(
      "SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1",
      { transaction }
    );

    for (const [index, announcement] of announcements.entries()) {
      await upsert(`
        INSERT INTO announcements (id, title, "bodyHtml", "bodyPreview", "imageUrl", "authorUserId", "expiryAt", "tenantId", "createdAt", "updatedAt")
        VALUES (:id, :title, :body, :preview, :image, :authorUserId, NULL, :tenantId, NOW() - (:ageDays || ' days')::interval, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          "bodyHtml" = EXCLUDED."bodyHtml",
          "bodyPreview" = EXCLUDED."bodyPreview",
          "imageUrl" = EXCLUDED."imageUrl",
          "tenantId" = EXCLUDED."tenantId",
          "updatedAt" = NOW(),
          "deletedAt" = NULL
      `, {
        ...announcement,
        body: `<p>${announcement.preview}</p>`,
        tenantId: TENANT_ID,
        authorUserId: adminUser.id,
        ageDays: String(index)
      }, transaction);

      for (const courseId of [1, 2, 3, 4, 5]) {
        await upsert(`
          INSERT INTO "announcementCourses" ("announcementId", "courseId", "isPinned", "pinnedAt", "isHome", "attachedAt", "createdAt", "updatedAt")
          VALUES (:announcementId, :courseId, :isPinned, CASE WHEN :isPinned THEN NOW() ELSE NULL END, true, NOW(), NOW(), NOW())
          ON CONFLICT ("announcementId", "courseId") WHERE "deletedAt" IS NULL DO UPDATE SET
            "isPinned" = EXCLUDED."isPinned",
            "pinnedAt" = EXCLUDED."pinnedAt",
            "isHome" = EXCLUDED."isHome",
            "attachedAt" = EXCLUDED."attachedAt",
            "updatedAt" = NOW()
        `, {
          announcementId: announcement.id,
          courseId,
          isPinned: index === 0
        }, transaction);
      }
    }

    await sequelize.query(`
      SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1), true);
      SELECT setval('courses_id_seq', GREATEST((SELECT MAX(id) FROM courses), 1), true);
      SELECT setval('modules_id_seq', GREATEST((SELECT MAX(id) FROM modules), 1), true);
      SELECT setval('contents_id_seq', GREATEST((SELECT MAX(id) FROM contents), 1), true);
      SELECT setval('videos_id_seq', GREATEST((SELECT MAX(id) FROM videos), 1), true);
      SELECT setval('resources_id_seq', GREATEST((SELECT MAX(id) FROM resources), 1), true);
      SELECT setval('enrollments_id_seq', GREATEST((SELECT MAX(id) FROM enrollments), 1), true);
      SELECT setval('categories_id_seq', GREATEST((SELECT MAX(id) FROM categories), 1), true);
      SELECT setval('"courseCategories_id_seq"', GREATEST((SELECT MAX(id) FROM "courseCategories"), 1), true);
    `, { transaction });

    await transaction.commit();
    await require('./seed-library-examples').seedLibraryExamples();
    console.log(`Seeded ${courses.length} TempleInfo courses and enrolled ${studentEmails.length} learners.`);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) main();
module.exports = { courses, contentId, TENANT_ID };
