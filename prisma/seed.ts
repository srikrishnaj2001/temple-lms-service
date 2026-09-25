import { PrismaClient, ContentType, ProgressStatus } from "@prisma/client";

const prisma = new PrismaClient();

const seedIds = {
  etiquetteCourse: "c6eca876-b170-40d6-9617-0f65f94879be",
  etiquetteWelcomeModule: "6b8d1d36-2cc0-4b5c-8c63-66e0d4a7d401",
  etiquetteServiceMindset: "95c0b3b5-78d9-4274-b0c1-1f2c0926e3a6",
  etiquetteDailyFlow: "e9f9c96a-3082-40e5-8e3d-3c32c19f5949",
  etiquetteGuestCareModule: "8f39e1f6-0ac3-4e0e-8a29-5d2c3f8f7e32",
  etiquetteGreetingChecklist: "c7fe1444-8412-4a46-83f2-324775244768",
  kitchenCourse: "acc76a88-d5c0-4ce8-a919-f2f28ff7253b",
  kitchenSafetyModule: "df1f2454-15d2-4383-a93c-19010c92e76a",
  kitchenOrientation: "3e47b7a8-9f66-48e8-8831-2ca47d55de77",
  kitchenCleanliness: "e2ce35ff-cf6f-466f-9d57-9c7eac8fdaf5",
  kitchenStationDiagram: "2f482c94-f0cb-468f-a204-a314a30c1821",
  kitchenAllergenChecklist: "24ecbb73-5ed0-4f2c-bc19-06d4d1a51a77",
  kitchenAudioBriefing: "f15c77a1-8f97-4ed4-bc40-e4480de80455",
  kitchenServingModule: "a87d019f-bb48-4122-90a3-3a4ce49ddf6c",
  kitchenServingVideo: "b6f02b1f-0646-4c38-9a92-22709cfa147d",
  kitchenCleanupSheet: "5cc6f976-276c-4b77-8709-292ceda8f983",
  worshipCourse: "d6d6f772-4b47-4a24-be7e-00f5bb312c5b",
  worshipReadinessModule: "9b909645-d475-45b2-a121-296762e22902",
  worshipBeforeVisitors: "0757e980-0b40-4655-a79e-4ad384d0c591",
  worshipPlacementGuide: "2170d052-d6b2-4922-ae3c-cd5e2fb78345",
  worshipMorningAudio: "c27583f3-9440-41cd-a573-912e52711d7f",
  worshipSupportModule: "42f728be-ac96-49ff-bc34-b831e302eb04",
  worshipCoordinationVideo: "f3f393a8-d0bf-434d-bb6d-830593cd72ee",
  worshipFestivalSheet: "07ce03b8-f20b-47d9-99f9-e33a1d079103"
};

const transcripts = {
  templeFlow:
    "Welcome to the daily service walkthrough. Start by noticing the entry path, shoe area, donation desk, kitchen pass, and main hall. Keep movement quiet near the altar, offer directions before visitors need to ask, and hand off questions to the right volunteer instead of improvising.",
  kitchenOrientation:
    "In this lesson we walk through the prasadam kitchen from clean entry to final serving line. First, wash hands and confirm hair coverings. Next, check the prep, cooking, packing, and cleaning stations. Keep allergen ingredients labelled, separate raw and cooked items, and close the session by recording what was cleaned.",
  servingLine:
    "The serving line works best when every volunteer keeps one simple role. One person plates, one person refills, one person watches queue movement, and one person clears the return area. Speak gently, keep the line moving, and pause service if a spill or allergy concern appears.",
  pujaCoordination:
    "During puja, coordination should be visible to the team but quiet to visitors. Stand where you can see the priest, avoid crossing the altar path, prepare items before they are requested, and use small hand signals for timing. The goal is support without drawing attention away from worship."
};

const youtubeVideos = {
  gitaIntro: "youtube:2xzuM4x-dbY",
  gitaChapter2Session1: "youtube:6Z3sR0gm7zI",
  gitaChapter2Session2: "youtube:WXIavZE24Ek",
  kirtanSyamantaka: "youtube:PW5pcc4ubL8",
  prabhupadaPastimes: "youtube:Ty-L0F0L2sI",
  lordBalaram: "youtube:C2wU460ntfM",
  chirHaran: "youtube:fxcKdOFyuDk",
  madhyaLila: "youtube:cszXCwN1Yfk",
  juhuTempleStory: "youtube:OLKcd6EBHqA",
  krishnaKatha: "youtube:rraY2T5HT2k"
};

function youtubeThumbnail(video: string) {
  const id = video.replace("youtube:", "");
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

function commonsImage(fileName: string, width = 1400) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;
}

const iskconImages = {
  mayapurTemple: commonsImage("Sri Krishna Temple, ISKCON, Mayapur.jpg"),
  bangaloreTemple: commonsImage("Radha Krishna-chandra Temple.jpg"),
  juhuDeities: commonsImage("Sri Radha Rasabihariji -ISKCON Juhu.jpg"),
  vrindavanDeities: commonsImage("Radha Krishna at Iskcon Vrindavan.jpg"),
  krishnaDarshan: commonsImage("Krishna in ISKCON Lalmonirhat.jpg"),
  fruitOffering: commonsImage("Fruit offering.jpg"),
  sundayFeast: commonsImage("Sunday Love feast.jpg"),
  prasadamHall: commonsImage("Brahmachari Prasadam Hall - ISKCON Campus - Mayapur - Nadia 2017-08-15 2054.JPG"),
  bookStall: commonsImage("Book Stall - ISKCON Campus - Mayapur - Nadia 2017-08-15 2059.JPG"),
  rathaYatra: commonsImage("ISKCON Ratha Yatra 2024, Dhaka.jpg"),
  hareKrishnaDevotee: commonsImage("Hare krishna devote.jpg"),
  flowerHoli: commonsImage("Flower holi.jpg"),
  annaDanComplex: commonsImage("Bhaktivedanta Anna-Dan Complex - ISKCON Campus - Mayapur - Nadia 2017-08-15 1966.JPG"),
  bookMembershipStall: commonsImage("Book And Life Membership Stal - ISKCON Campus - Mayapur - Nadia 2017-08-15 1877.JPG")
};

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { domain: "demo.localhost" },
    update: { name: "Demo Temple" },
    create: { domain: "demo.localhost", name: "Demo Temple" }
  });

  const roleRecords = await Promise.all(
    [
      "admin",
      "chef",
      "priest",
      "accountant",
      "volunteer",
      "guest-care",
      "kirtan",
      "festival",
      "book-distribution",
      "facilities",
      "youth-guide"
    ].map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name }
      })
    )
  );
  const roleByName = Object.fromEntries(roleRecords.map((role) => [role.name, role]));
  const adminRole = roleByName.admin;
  const chefRole = roleByName.chef;
  const priestRole = roleByName.priest;
  const accountantRole = roleByName.accountant;
  const volunteerRole = roleByName.volunteer;
  const guestCareRole = roleByName["guest-care"];
  const kirtanRole = roleByName.kirtan;
  const festivalRole = roleByName.festival;
  const bookDistributionRole = roleByName["book-distribution"];
  const facilitiesRole = roleByName.facilities;
  const youthGuideRole = roleByName["youth-guide"];

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { name: "Temple Admin" },
    create: { name: "Temple Admin", email: "admin@example.com", phone: "+1 555 0100" }
  });

  const learner = await prisma.user.upsert({
    where: { email: "learner@example.com" },
    update: { name: "Gita Sharma" },
    create: { name: "Gita Sharma", email: "learner@example.com", phone: "+1 555 0101" }
  });

  await prisma.announcement.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.enrollment.deleteMany({ where: { course: { tenantId: tenant.id } } });
  await prisma.course.deleteMany({ where: { tenantId: tenant.id } });

  for (const [userId, roleId] of [
    [admin.id, adminRole.id],
    [admin.id, chefRole.id],
    [learner.id, chefRole.id],
    [learner.id, priestRole.id],
    [learner.id, volunteerRole.id],
    [learner.id, guestCareRole.id],
    [learner.id, kirtanRole.id],
    [learner.id, festivalRole.id],
    [learner.id, bookDistributionRole.id],
    [learner.id, facilitiesRole.id],
    [learner.id, youthGuideRole.id]
  ]) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId }
    });
  }

  const etiquette = await prisma.course.create({
    data: {
      id: seedIds.etiquetteCourse,
      tenantId: tenant.id,
      title: "Temple Etiquette Foundations",
      description: "A practical onboarding path for respectful service, space awareness, and guest care.",
      coverImage: iskconImages.mayapurTemple,
      roles: { create: [{ roleId: chefRole.id }, { roleId: priestRole.id }] },
      modules: {
        create: [
          {
            id: seedIds.etiquetteWelcomeModule,
            title: "Welcome to Service",
            description: "Understand the rhythm of daily temple operations.",
            sequenceNumber: 1,
            contents: {
              create: [
                {
                  id: seedIds.etiquetteServiceMindset,
                  type: ContentType.RICH_TEXT,
                  title: "Service Mindset",
                  description: "A short reading on how attention, humility, and practical awareness shape temple service.",
                  sequenceNumber: 1,
                  richText: { create: { body: "<p>Service begins with attention. Notice people, spaces, and timing before acting.</p>" } }
                },
                {
                  id: seedIds.etiquetteDailyFlow,
                  type: ContentType.VIDEO,
                  title: "Daily Flow Walkthrough",
                  description: "A guided tour of the visitor path, daily volunteer handoffs, and the places where quiet coordination matters most.",
                  sequenceNumber: 2,
                  video: {
                    create: {
                      externalVideoId: youtubeVideos.gitaIntro,
                      duration: 420,
                      thumbnailUrl: youtubeThumbnail(youtubeVideos.gitaIntro),
                      transcript: transcripts.templeFlow
                    }
                  }
                }
              ]
            }
          },
          {
            id: seedIds.etiquetteGuestCareModule,
            title: "Guest Care",
            description: "Make visitors feel oriented without overwhelming them.",
            sequenceNumber: 2,
            contents: {
              create: [
                {
                  id: seedIds.etiquetteGreetingChecklist,
                  type: ContentType.DOCUMENT,
                  title: "Guest Greeting Checklist",
                  description: "Printable checklist for welcoming first-time visitors, families, and regular attendees during busy hours.",
                  sequenceNumber: 1,
                  document: { create: { fileUrl: "https://example.com/guest-greeting.pdf", fileType: "application/pdf", fileSize: 184000 } }
                }
              ]
            }
          }
        ]
      }
    },
    include: { modules: { include: { contents: true } } }
  });

  const kitchen = await prisma.course.create({
    data: {
      id: seedIds.kitchenCourse,
      tenantId: tenant.id,
      title: "Kitchen Safety and Prasadam Standards",
      description: "Chef training for cleanliness, ingredient handling, and distribution readiness.",
      coverImage: iskconImages.prasadamHall,
      roles: { create: [{ roleId: chefRole.id }] },
      modules: {
        create: [
          {
            id: seedIds.kitchenSafetyModule,
            title: "Food Safety Basics",
            description: "Core daily practices before cooking begins.",
            sequenceNumber: 1,
            contents: {
              create: [
                {
                  id: seedIds.kitchenOrientation,
                  type: ContentType.VIDEO,
                  title: "Prasadam Kitchen Orientation",
                  description: "A short walkthrough of handwash stations, prep zones, and serving flow.",
                  sequenceNumber: 1,
                  video: {
                    create: {
                      externalVideoId: youtubeVideos.gitaChapter2Session1,
                      duration: 360,
                      thumbnailUrl: youtubeThumbnail(youtubeVideos.gitaChapter2Session1),
                      transcript: transcripts.kitchenOrientation
                    }
                  }
                },
                {
                  id: seedIds.kitchenCleanliness,
                  type: ContentType.RICH_TEXT,
                  title: "Cleanliness Standards Before Service",
                  description: "Read the daily expectations for personal hygiene, counters, utensils, and storage.",
                  sequenceNumber: 2,
                  richText: {
                    create: {
                      body: "<p>Before service, every volunteer confirms clean hands, covered hair, labelled ingredients, and sanitized work surfaces.</p><ul><li>Wash hands before handling ingredients.</li><li>Keep raw and cooked items separate.</li><li>Use fresh towels for each station.</li></ul>"
                    }
                  }
                },
                {
                  id: seedIds.kitchenStationDiagram,
                  type: ContentType.IMAGE,
                  title: "Station Setup Diagram",
                  description: "Visual reference for arranging prep, cooking, packing, and cleaning zones.",
                  sequenceNumber: 3,
                  image: { create: { url: iskconImages.fruitOffering, altText: "Fresh fruit offering prepared for Krishna" } }
                },
                {
                  id: seedIds.kitchenAllergenChecklist,
                  type: ContentType.DOCUMENT,
                  title: "Ingredient and Allergen Checklist",
                  description: "Downloadable checklist for reviewing ingredient labels before prasadam distribution.",
                  sequenceNumber: 4,
                  document: {
                    create: {
                      fileUrl: "https://example.com/ingredient-allergen-checklist.pdf",
                      fileType: "application/pdf",
                      fileSize: 128000
                    }
                  }
                },
                {
                  id: seedIds.kitchenAudioBriefing,
                  type: ContentType.AUDIO,
                  title: "Opening Kitchen Briefing",
                  description: "Audio recap for volunteers joining after the first group briefing.",
                  sequenceNumber: 5,
                  audio: {
                    create: {
                      url: "https://example.com/opening-kitchen-briefing.mp3",
                      duration: 180
                    }
                  }
                }
              ]
            }
          },
          {
            id: seedIds.kitchenServingModule,
            title: "Serving and Distribution",
            description: "Serve guests with warmth while preserving safety and order.",
            sequenceNumber: 2,
            contents: {
              create: [
                {
                  id: seedIds.kitchenServingVideo,
                  type: ContentType.VIDEO,
                  title: "Serving Line Flow",
                  description: "How volunteers coordinate plates, queues, refills, and cleanup.",
                  sequenceNumber: 1,
                  video: {
                    create: {
                      externalVideoId: youtubeVideos.gitaChapter2Session2,
                      duration: 300,
                      thumbnailUrl: youtubeThumbnail(youtubeVideos.gitaChapter2Session2),
                      transcript: transcripts.servingLine
                    }
                  }
                },
                {
                  id: seedIds.kitchenCleanupSheet,
                  type: ContentType.DOCUMENT,
                  title: "End-of-Service Cleanup Sheet",
                  description: "Closeout checklist for counters, storage, waste, and equipment.",
                  sequenceNumber: 2,
                  document: {
                    create: {
                      fileUrl: "https://example.com/end-of-service-cleanup.pdf",
                      fileType: "application/pdf",
                      fileSize: 92000
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }
  });

  const worship = await prisma.course.create({
    data: {
      id: seedIds.worshipCourse,
      tenantId: tenant.id,
      title: "Puja Preparation and Sacred Space Care",
      description: "Priest and volunteer training for altar readiness, item handling, and respectful coordination.",
      coverImage: iskconImages.juhuDeities,
      roles: { create: [{ roleId: priestRole.id }] },
      modules: {
        create: [
          {
            id: seedIds.worshipReadinessModule,
            title: "Altar Readiness",
            description: "Prepare the room, supplies, and timing before the ceremony begins.",
            sequenceNumber: 1,
            contents: {
              create: [
                {
                  id: seedIds.worshipBeforeVisitors,
                  type: ContentType.RICH_TEXT,
                  title: "Before the First Visitor Arrives",
                  description: "A quiet checklist for preparing the altar and keeping movement respectful.",
                  sequenceNumber: 1,
                  richText: {
                    create: {
                      body: "<p>Begin with the space. Confirm the altar is clean, lamps are ready, flowers are fresh, and pathways are open for visitors.</p>"
                    }
                  }
                },
                {
                  id: seedIds.worshipPlacementGuide,
                  type: ContentType.IMAGE,
                  title: "Sacred Items Placement Guide",
                  description: "Reference image for arranging common items without crowding the altar.",
                  sequenceNumber: 2,
                  image: {
                    create: {
                      url: iskconImages.vrindavanDeities,
                      altText: "Radha Krishna deities at ISKCON Vrindavan"
                    }
                  }
                },
                {
                  id: seedIds.worshipMorningAudio,
                  type: ContentType.AUDIO,
                  title: "Morning Preparation Recitation",
                  description: "Short audio guide for volunteers who support the opening routine.",
                  sequenceNumber: 3,
                  audio: {
                    create: {
                      url: "https://example.com/morning-preparation-recitation.mp3",
                      duration: 210
                    }
                  }
                }
              ]
            }
          },
          {
            id: seedIds.worshipSupportModule,
            title: "Ceremony Support",
            description: "Coordinate timing and communication during active worship.",
            sequenceNumber: 2,
            contents: {
              create: [
                {
                  id: seedIds.worshipCoordinationVideo,
                  type: ContentType.VIDEO,
                  title: "Coordinating During Puja",
                  description: "Where to stand, when to move, and how to assist without interrupting.",
                  sequenceNumber: 1,
                  video: {
                    create: {
                      externalVideoId: youtubeVideos.kirtanSyamantaka,
                      duration: 480,
                      thumbnailUrl: youtubeThumbnail(youtubeVideos.kirtanSyamantaka),
                      transcript: transcripts.pujaCoordination
                    }
                  }
                },
                {
                  id: seedIds.worshipFestivalSheet,
                  type: ContentType.DOCUMENT,
                  title: "Festival Day Readiness Sheet",
                  description: "Printable reference for higher-traffic worship days.",
                  sequenceNumber: 2,
                  document: {
                    create: {
                      fileUrl: "https://example.com/festival-day-readiness.pdf",
                      fileType: "application/pdf",
                      fileSize: 145000
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }
  });

  const extraCourses = await Promise.all([
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Bhagavad Gita Foundations for Volunteers",
        description: "A gentle study path for understanding service, steadiness, and devotional intention.",
        coverImage: iskconImages.krishnaDarshan,
        roles: { create: [{ roleId: volunteerRole.id }, { roleId: guestCareRole.id }, { roleId: youthGuideRole.id }] },
        modules: {
          create: [
            {
              title: "Starting with the Gita",
              description: "Set context before joining discussions or guiding visitors.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Bhagavad Gita Summary: Introduction and Chapter 1",
                    description: "Introductory ISKCON Bangalore class for new learners and volunteers.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.gitaIntro,
                        duration: 1800,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.gitaIntro),
                        transcript: "This introductory session frames the Bhagavad Gita as a practical guide for daily decisions, service mood, and spiritual steadiness."
                      }
                    }
                  },
                  {
                    type: ContentType.RICH_TEXT,
                    title: "How to Listen During Class",
                    description: "Simple habits for taking notes and keeping attention during discourse.",
                    sequenceNumber: 2,
                    richText: {
                      create: {
                        body: "<p>Listen for one principle, one practical action, and one question to ask later. Keep the discussion respectful and avoid turning class into debate.</p>"
                      }
                    }
                  },
                  {
                    type: ContentType.DOCUMENT,
                    title: "Gita Reflection Worksheet",
                    description: "A one-page reflection sheet for volunteers after a class.",
                    sequenceNumber: 3,
                    document: { create: { fileUrl: "https://example.com/gita-reflection-worksheet.pdf", fileType: "application/pdf", fileSize: 96000 } }
                  }
                ]
              }
            },
            {
              title: "Applying the Teaching",
              description: "Move from listening to calm action in service.",
              sequenceNumber: 2,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Bhagavad Gita Chapter 2: Session 1",
                    description: "A focused session on steadiness, duty, and practical spiritual intelligence.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.gitaChapter2Session1,
                        duration: 2100,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.gitaChapter2Session1),
                        transcript: "Chapter 2 introduces steadiness in action. Volunteers can apply this by serving without agitation, listening before responding, and completing assigned duties carefully."
                      }
                    }
                  },
                  {
                    type: ContentType.AUDIO,
                    title: "Five-Minute Reflection Prompt",
                    description: "Audio prompt for reviewing what you learned after service.",
                    sequenceNumber: 2,
                    audio: { create: { url: "https://example.com/gita-reflection-prompt.mp3", duration: 300 } }
                  }
                ]
              }
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Kirtan Seva and Program Support",
        description: "Training for devotees helping with kirtan setup, flow, instruments, and guest participation.",
        coverImage: iskconImages.hareKrishnaDevotee,
        roles: { create: [{ roleId: kirtanRole.id }, { roleId: volunteerRole.id }] },
        modules: {
          create: [
            {
              title: "Kirtan Room Readiness",
              description: "Prepare the space before devotees arrive.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Pastimes of Syamantaka Jewel",
                    description: "Sample ISKCON Juhu kirtan and lecture media for devotional listening practice.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.kirtanSyamantaka,
                        duration: 2700,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.kirtanSyamantaka),
                        transcript: "Use this recording as a practice reference for listening mood, room etiquette, and how program flow remains devotional even when many people are present."
                      }
                    }
                  },
                  {
                    type: ContentType.IMAGE,
                    title: "Kirtan Setup Layout",
                    description: "Visual reference for mic stands, instrument placement, and walking paths.",
                    sequenceNumber: 2,
                    image: { create: { url: iskconImages.hareKrishnaDevotee, altText: "Hare Krishna devotee participating in devotional practice" } }
                  },
                  {
                    type: ContentType.RICH_TEXT,
                    title: "Sound Check Etiquette",
                    description: "A short checklist for staying calm during setup.",
                    sequenceNumber: 3,
                    richText: { create: { body: "<p>Arrive early, keep cables tidy, test one microphone at a time, and avoid loud checks once visitors are seated.</p>" } }
                  }
                ]
              }
            },
            {
              title: "Program Flow",
              description: "Support the lead kirtaniya and program host.",
              sequenceNumber: 2,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Pastimes of Srila Prabhupada",
                    description: "Devotional lecture media used for timing, attentiveness, and stage-support practice.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.prabhupadaPastimes,
                        duration: 2400,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.prabhupadaPastimes),
                        transcript: "Watch how the program keeps attention centered on the speaker and subject. Volunteers should support that focus through quiet movement and timely handoffs."
                      }
                    }
                  },
                  {
                    type: ContentType.DOCUMENT,
                    title: "Program Support Checklist",
                    description: "Checklist for sound, seating, water, books, and cleanup.",
                    sequenceNumber: 2,
                    document: { create: { fileUrl: "https://example.com/program-support-checklist.pdf", fileType: "application/pdf", fileSize: 112000 } }
                  }
                ]
              }
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Festival Volunteer Readiness",
        description: "Prepare for high-traffic temple days with calm coordination and clear roles.",
        coverImage: iskconImages.rathaYatra,
        roles: { create: [{ roleId: festivalRole.id }, { roleId: volunteerRole.id }, { roleId: chefRole.id }] },
        modules: {
          create: [
            {
              title: "Crowd Flow and Guest Care",
              description: "Help visitors move through the temple with less confusion.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Pastimes of Lord Balaram Ji",
                    description: "Festival-season devotional media for program volunteers.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.lordBalaram,
                        duration: 2500,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.lordBalaram),
                        transcript: "Festival volunteers should know the program flow, keep entrances clear, and help guests feel oriented without rushing them."
                      }
                    }
                  },
                  {
                    type: ContentType.RICH_TEXT,
                    title: "Festival Day Roles",
                    description: "Understand common stations: entry, shoe area, hall seating, prasadam, and information desk.",
                    sequenceNumber: 2,
                    richText: { create: { body: "<p>Each volunteer should know their station, backup contact, break timing, and the nearest escalation point for medical, crowd, or lost-item concerns.</p>" } }
                  },
                  {
                    type: ContentType.DOCUMENT,
                    title: "Festival Shift Handoff Sheet",
                    description: "Printable handoff for incoming and outgoing volunteer groups.",
                    sequenceNumber: 3,
                    document: { create: { fileUrl: "https://example.com/festival-shift-handoff.pdf", fileType: "application/pdf", fileSize: 125000 } }
                  }
                ]
              }
            },
            {
              title: "After Program Cleanup",
              description: "Close the day with order and gratitude.",
              sequenceNumber: 2,
              contents: {
                create: [
                  {
                    type: ContentType.AUDIO,
                    title: "Cleanup Lead Briefing",
                    description: "Audio briefing for cleanup leads before prasadam and hall reset.",
                    sequenceNumber: 1,
                    audio: { create: { url: "https://example.com/festival-cleanup-lead.mp3", duration: 420 } }
                  },
                  {
                    type: ContentType.IMAGE,
                    title: "Hall Reset Reference",
                    description: "Image reference for returning seating and pathways to standard layout.",
                    sequenceNumber: 2,
                    image: { create: { url: iskconImages.sundayFeast, altText: "ISKCON Sunday feast gathering" } }
                  }
                ]
              }
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Book Distribution and Guest Conversations",
        description: "A practical path for speaking with visitors respectfully and offering literature with care.",
        coverImage: iskconImages.bookStall,
        roles: { create: [{ roleId: bookDistributionRole.id }, { roleId: guestCareRole.id }, { roleId: volunteerRole.id }] },
        modules: {
          create: [
            {
              title: "Starting Conversations",
              description: "Learn how to begin and end conversations gracefully.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Chir Haran Lila",
                    description: "Devotional media for learning attentive listening and thoughtful follow-up questions.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.chirHaran,
                        duration: 2300,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.chirHaran),
                        transcript: "Book distribution begins with respect. Ask simple questions, listen sincerely, and offer the right book without pressure."
                      }
                    }
                  },
                  {
                    type: ContentType.RICH_TEXT,
                    title: "Conversation Principles",
                    description: "Short guidance for speaking with first-time visitors.",
                    sequenceNumber: 2,
                    richText: { create: { body: "<p>Be warm, brief, and honest. If someone declines, thank them kindly. If they are curious, guide them to a beginner-friendly book or class.</p>" } }
                  },
                  {
                    type: ContentType.DOCUMENT,
                    title: "Beginner Book Guide",
                    description: "Reference sheet for matching visitor interests with introductory books.",
                    sequenceNumber: 3,
                    document: { create: { fileUrl: "https://example.com/beginner-book-guide.pdf", fileType: "application/pdf", fileSize: 99000 } }
                  }
                ]
              }
            },
            {
              title: "Follow-Up and Care",
              description: "Help visitors take the next step without overwhelming them.",
              sequenceNumber: 2,
              contents: {
                create: [
                  {
                    type: ContentType.AUDIO,
                    title: "Follow-Up Call Practice",
                    description: "Audio example for a calm post-visit follow-up conversation.",
                    sequenceNumber: 1,
                    audio: { create: { url: "https://example.com/follow-up-call-practice.mp3", duration: 260 } }
                  }
                ]
              }
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Facilities and Clean Temple Care",
        description: "Training for keeping temple spaces clean, safe, welcoming, and ready for worship.",
        coverImage: iskconImages.annaDanComplex,
        roles: { create: [{ roleId: facilitiesRole.id }, { roleId: volunteerRole.id }] },
        modules: {
          create: [
            {
              title: "Daily Space Care",
              description: "Daily checks for hallways, shoe racks, restrooms, and common areas.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "C.C. Class Madhya-Lila 19.114-115",
                    description: "Devotional listening content for facilities volunteers during orientation.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.madhyaLila,
                        duration: 2200,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.madhyaLila),
                        transcript: "A clean temple helps visitors feel cared for. Facilities seva is quiet, practical, and deeply connected to the visitor experience."
                      }
                    }
                  },
                  {
                    type: ContentType.IMAGE,
                    title: "Common Area Reset Map",
                    description: "Visual layout for restoring common areas after programs.",
                    sequenceNumber: 2,
                    image: { create: { url: iskconImages.bangaloreTemple, altText: "ISKCON Bangalore temple interior reference" } }
                  },
                  {
                    type: ContentType.DOCUMENT,
                    title: "Daily Facilities Checklist",
                    description: "Checklist for opening, midpoint, and closing rounds.",
                    sequenceNumber: 3,
                    document: { create: { fileUrl: "https://example.com/daily-facilities-checklist.pdf", fileType: "application/pdf", fileSize: 118000 } }
                  }
                ]
              }
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Youth Class Facilitation",
        description: "Support children and youth classes with structure, warmth, safety, and devotional focus.",
        coverImage: iskconImages.flowerHoli,
        roles: { create: [{ roleId: youthGuideRole.id }, { roleId: volunteerRole.id }] },
        modules: {
          create: [
            {
              title: "Class Flow",
              description: "Create a calm class rhythm for young learners.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "Sri Krishna Katha",
                    description: "Devotional storytelling reference for youth guides and class volunteers.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.krishnaKatha,
                        duration: 2600,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.krishnaKatha),
                        transcript: "A youth guide keeps the story simple, checks for understanding, and makes space for sincere questions."
                      }
                    }
                  },
                  {
                    type: ContentType.RICH_TEXT,
                    title: "Youth Safety and Attention",
                    description: "How to keep class safe, kind, and focused.",
                    sequenceNumber: 2,
                    richText: { create: { body: "<p>Keep two adults present, avoid one-on-one isolated situations, use short activities, and redirect gently when attention drifts.</p>" } }
                  },
                  {
                    type: ContentType.AUDIO,
                    title: "Opening Mantra Practice",
                    description: "Short audio practice for beginning youth sessions.",
                    sequenceNumber: 3,
                    audio: { create: { url: "https://example.com/opening-mantra-practice.mp3", duration: 180 } }
                  }
                ]
              }
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: "Donation Desk and Basic Accounting",
        description: "Simple operational training for receipts, donor care, reconciliation, and escalation.",
        coverImage: iskconImages.bookMembershipStall,
        roles: { create: [{ roleId: accountantRole.id }, { roleId: volunteerRole.id }] },
        modules: {
          create: [
            {
              title: "Desk Readiness",
              description: "Prepare receipts, QR codes, counters, and handoff notes.",
              sequenceNumber: 1,
              contents: {
                create: [
                  {
                    type: ContentType.VIDEO,
                    title: "I'll Build You a Temple: The Juhu Story",
                    description: "Devotional context video for donation desk volunteers.",
                    sequenceNumber: 1,
                    video: {
                      create: {
                        externalVideoId: youtubeVideos.juhuTempleStory,
                        duration: 2500,
                        thumbnailUrl: youtubeThumbnail(youtubeVideos.juhuTempleStory),
                        transcript: "Donation desk seva combines accuracy and kindness. Record details clearly, respect donor privacy, and escalate mismatched entries immediately."
                      }
                    }
                  },
                  {
                    type: ContentType.RICH_TEXT,
                    title: "Receipt and Privacy Rules",
                    description: "Basic do's and don'ts for donor-facing volunteers.",
                    sequenceNumber: 2,
                    richText: { create: { body: "<p>Confirm donor name, amount, purpose, and contact details. Do not discuss one donor's contribution with another visitor.</p>" } }
                  },
                  {
                    type: ContentType.DOCUMENT,
                    title: "End-of-Day Reconciliation Sheet",
                    description: "Demo document for closing donation desk totals.",
                    sequenceNumber: 3,
                    document: { create: { fileUrl: "https://example.com/end-of-day-reconciliation.pdf", fileType: "application/pdf", fileSize: 121000 } }
                  }
                ]
              }
            }
          ]
        }
      }
    })
  ]);

  const allSeededCourses = [etiquette, kitchen, worship, ...extraCourses];

  for (const courseId of allSeededCourses.map((course) => course.id)) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: learner.id, courseId } },
      update: {},
      create: { userId: learner.id, courseId }
    });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: learner.id, courseId: etiquette.id } },
    include: { course: { include: { modules: { include: { contents: true } } } } }
  });

  const firstContent = enrollment?.course.modules[0]?.contents[0];
  if (enrollment && firstContent) {
    await prisma.contentProgress.upsert({
      where: { enrollmentId_contentId: { enrollmentId: enrollment.id, contentId: firstContent.id } },
      update: { status: ProgressStatus.COMPLETED, completedAt: new Date() },
      create: {
        enrollmentId: enrollment.id,
        contentId: firstContent.id,
        status: ProgressStatus.COMPLETED,
        completedAt: new Date()
      }
    });
  }

  const announcement = await prisma.announcement.create({
    data: {
      tenantId: tenant.id,
      authorId: admin.id,
      title: "Saturday orientation starts at 9 AM",
      bodyHtml: "<p>Please arrive ten minutes early and bring your badge. Kitchen and guest-care groups will split after the welcome session.</p>",
      imageUrl: iskconImages.mayapurTemple,
      courses: {
        create: [
          { courseId: etiquette.id, isPinned: true },
          { courseId: kitchen.id, isPinned: false },
          { courseId: extraCourses[2].id, isPinned: true }
        ]
      }
    }
  });

  await Promise.all([
    prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        authorId: admin.id,
        title: "New Bhagavad Gita study batch opens this week",
        bodyHtml: "<p>The introductory Gita course now includes video lessons, reflection sheets, and short audio prompts. New volunteers can begin from the Courses page.</p>",
        imageUrl: iskconImages.krishnaDarshan,
        courses: { create: [{ courseId: extraCourses[0].id, isPinned: true }, { courseId: etiquette.id, isPinned: false }] }
      }
    }),
    prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        authorId: admin.id,
        title: "Kirtan support team rehearsal on Thursday",
        bodyHtml: "<p>Sound, seating, and instrument volunteers should review the Kirtan Seva course before rehearsal. Please arrive with enough time for microphone checks.</p>",
        imageUrl: iskconImages.hareKrishnaDevotee,
        courses: { create: [{ courseId: extraCourses[1].id, isPinned: false }] }
      }
    }),
    prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        authorId: admin.id,
        title: "Festival volunteer assignments are ready",
        bodyHtml: "<p>Entry, prasadam, hall, and cleanup stations have updated handoff notes. Review the Festival Volunteer Readiness course before your first shift.</p>",
        imageUrl: iskconImages.rathaYatra,
        courses: { create: [{ courseId: extraCourses[2].id, isPinned: true }, { courseId: kitchen.id, isPinned: false }] }
      }
    }),
    prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        authorId: admin.id,
        title: "Donation desk closeout checklist updated",
        bodyHtml: "<p>The end-of-day reconciliation sheet has been refreshed for demo. Donation desk volunteers should review the privacy and receipt rules lesson.</p>",
        imageUrl: iskconImages.bookStall,
        courses: { create: [{ courseId: extraCourses[6].id, isPinned: false }] }
      }
    })
  ]);

  console.log(`Seeded ${tenant.name} with ${allSeededCourses.length} courses and announcement ${announcement.title}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
