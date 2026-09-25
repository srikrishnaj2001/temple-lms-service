'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting comprehensive curriculum setup...\n');

      // 1. Create 5 Courses
      console.log('📚 Creating courses...');
      const courses = await queryInterface.bulkInsert('cohorts', [
        {
          id: 1,
          title: 'Full Stack Web Development Bootcamp',
          description: 'Master modern web development with React, Node.js, and databases. Build production-ready applications from scratch.',
          start_date: new Date('2024-02-01T09:00:00Z'),
          end_date: new Date('2024-05-30T17:00:00Z'),
          calendar_url: 'https://calendar.google.com/fullstack-bootcamp',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          title: 'Data Science & Machine Learning Mastery',
          description: 'Complete data science journey from Python basics to advanced ML algorithms. Work with real datasets and deploy models.',
          start_date: new Date('2024-03-01T10:00:00Z'),
          end_date: new Date('2024-08-15T18:00:00Z'),
          calendar_url: 'https://calendar.google.com/data-science-mastery',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 3,
          title: 'Mobile App Development with React Native',
          description: 'Build cross-platform mobile apps for iOS and Android. Learn navigation, state management, and app store deployment.',
          start_date: new Date('2024-04-15T09:30:00Z'),
          end_date: new Date('2024-07-30T16:30:00Z'),
          calendar_url: 'https://calendar.google.com/mobile-development',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 4,
          title: 'Cloud Architecture & DevOps Engineering',
          description: 'Master AWS, Docker, Kubernetes, and CI/CD pipelines. Build scalable, secure cloud infrastructure.',
          start_date: new Date('2024-05-01T08:00:00Z'),
          end_date: new Date('2024-09-30T19:00:00Z'),
          calendar_url: 'https://calendar.google.com/cloud-devops',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 5,
          title: 'Cybersecurity Fundamentals & Ethical Hacking',
          description: 'Learn network security, penetration testing, and security best practices. Hands-on labs with real vulnerabilities.',
          start_date: new Date('2024-06-01T09:00:00Z'),
          end_date: new Date('2024-10-15T17:00:00Z'),
          calendar_url: 'https://calendar.google.com/cybersecurity-fundamentals',
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction, returning: true });

      // 2. Create 5 Users
      console.log('👥 Creating users...');
      const users = await queryInterface.bulkInsert('users', [
        {
          id: 1,
          name: 'Hemanth Kashyap',
          email: 'hkashyap2894@gmail.com',
          phone: '+918886478208',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          name: 'Sri',
          email: 'srikrishna.jarugubilli2001@gmail.com',
          phone: '+1-555-0102',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 3,
          name: 'Carol Martinez',
          email: 'carol.martinez@example.com',
          phone: '+1-555-0103',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 4,
          name: 'David Kumar',
          email: 'david.kumar@example.com',
          phone: '+1-555-0104',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 5,
          name: 'Emma Thompson',
          email: 'emma.thompson@example.com',
          phone: '+1-555-0105',
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction, returning: true });

      // 3. Create User Metadata
      console.log('📝 Creating user metadata...');
      await queryInterface.bulkInsert('user_metadata', [
        {
          user_id: 1,
          company: 'TechStart Inc.',
          designation: 'Frontend Developer',
          urls: JSON.stringify({
            linkedin: 'https://linkedin.com/in/alice-johnson',
            github: 'https://github.com/alice-j',
            portfolio: 'https://alice-johnson.dev'
          }),
          picture_url: 'https://images.unsplash.com/photo-1494790108755-2616b612b1d5?w=150',
          about: 'Passionate frontend developer with 3 years of experience in React and Vue.js. Love creating beautiful, user-friendly interfaces.',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 2,
          company: 'DataCorp Analytics',
          designation: 'Data Analyst',
          urls: JSON.stringify({
            linkedin: 'https://linkedin.com/in/bob-chen',
            github: 'https://github.com/bob-data',
            kaggle: 'https://kaggle.com/bobchen'
          }),
          picture_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          about: 'Data enthusiast with strong background in statistics and Python. Experienced in machine learning and data visualization.',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 3,
          company: 'Mobile Solutions LLC',
          designation: 'Mobile Developer',
          urls: JSON.stringify({
            linkedin: 'https://linkedin.com/in/carol-martinez',
            github: 'https://github.com/carol-mobile',
            dribbble: 'https://dribbble.com/carol-martinez'
          }),
          picture_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
          about: 'Mobile app developer specializing in React Native and Flutter. Published 5+ apps on both iOS and Android stores.',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 4,
          company: 'CloudTech Systems',
          designation: 'DevOps Engineer',
          urls: JSON.stringify({
            linkedin: 'https://linkedin.com/in/david-kumar',
            github: 'https://github.com/david-devops',
            medium: 'https://medium.com/@david-kumar'
          }),
          picture_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
          about: 'DevOps engineer with expertise in AWS, Docker, and Kubernetes. Passionate about automation and infrastructure as code.',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 5,
          company: 'SecureNet Consulting',
          designation: 'Security Analyst',
          urls: JSON.stringify({
            linkedin: 'https://linkedin.com/in/emma-thompson',
            github: 'https://github.com/emma-sec',
            twitter: 'https://twitter.com/emma_security'
          }),
          picture_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150',
          about: 'Cybersecurity professional with CISSP certification. Specializes in penetration testing and security architecture.',
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction });

      // 4. Create 5 Tools
      console.log('🛠️  Creating tools...');
      const tools = await queryInterface.bulkInsert('tools', [
        {
          id: 1,
          title: 'Visual Studio Code',
          description: 'A powerful, lightweight code editor with extensive extension support. Perfect for web development, debugging, and version control integration.',
          url: 'https://code.visualstudio.com/',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          title: 'GitHub',
          description: 'The world\'s leading software development platform. Essential for version control, collaboration, and project management in software development.',
          url: 'https://github.com/',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 3,
          title: 'Figma',
          description: 'Collaborative interface design tool for creating user interfaces, prototypes, and design systems. Industry standard for UI/UX design.',
          url: 'https://www.figma.com/',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 4,
          title: 'Postman',
          description: 'API development environment for testing, documenting, and sharing APIs. Essential tool for backend development and API integration.',
          url: 'https://www.postman.com/',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 5,
          title: 'Docker',
          description: 'Containerization platform that enables developers to package applications with their dependencies. Essential for modern deployment and DevOps.',
          url: 'https://www.docker.com/',
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction, returning: true });

      // 5. Create Community Links for each course
      console.log('💬 Creating community links...');
      const communityLinks = [];
      const now = new Date();

      for (let courseId = 1; courseId <= 5; courseId++) {
        communityLinks.push(
          {
            title: 'Slack Community',
            url: `https://clug-community.slack.com/channels/course-${courseId}`,
            cohort_id: courseId,
            created_at: now,
            updated_at: now
          },
          {
            title: 'WhatsApp Group',
            url: `https://chat.whatsapp.com/course-${courseId}-group`,
            cohort_id: courseId,
            created_at: now,
            updated_at: now
          },
          {
            title: 'Discord Server',
            url: `https://discord.gg/clug-course-${courseId}`,
            cohort_id: courseId,
            created_at: now,
            updated_at: now
          }
        );
      }

      await queryInterface.bulkInsert('community_links', communityLinks, { transaction });

      // 6. Create Course-Tool associations (all tools for all courses)
      console.log('🔗 Creating course-tool associations...');
      const courseToolAssociations = [];
      
      for (let courseId = 1; courseId <= 5; courseId++) {
        for (let toolId = 1; toolId <= 5; toolId++) {
          courseToolAssociations.push({
            cohort_id: courseId,
            tool_id: toolId,
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }

      await queryInterface.bulkInsert('cohort_tools', courseToolAssociations, { transaction });

      // 7. Create 5 Modules for each Course (25 total)
      console.log('📖 Creating modules...');
      const moduleData = [];
      
      // Course start dates for calculating module and content start dates
      const courseStartDates = {
        1: new Date('2024-02-01T09:00:00Z'), // Full Stack Web Development
        2: new Date('2024-03-01T10:00:00Z'), // Data Science & ML
        3: new Date('2024-04-15T09:30:00Z'), // Mobile App Development
        4: new Date('2024-05-01T08:00:00Z'), // Cloud Architecture & DevOps
        5: new Date('2024-06-01T09:00:00Z')  // Cybersecurity
      };
      
      const courseModules = {
        1: [ // Full Stack Web Development
          'HTML, CSS & JavaScript Fundamentals',
          'React.js & Component Architecture',
          'Node.js & Express Backend Development',
          'Database Design & Integration',
          'Deployment & Production Best Practices'
        ],
        2: [ // Data Science & ML
          'Python Programming & Data Structures',
          'Data Analysis with Pandas & NumPy',
          'Data Visualization & Storytelling',
          'Machine Learning Algorithms',
          'Deep Learning & Neural Networks'
        ],
        3: [ // Mobile App Development
          'React Native Setup & Navigation',
          'UI/UX Design & Component Library',
          'State Management & API Integration',
          'Native Device Features & Performance',
          'App Store Deployment & Maintenance'
        ],
        4: [ // Cloud Architecture & DevOps
          'AWS Cloud Fundamentals & Services',
          'Containerization with Docker',
          'Kubernetes Orchestration',
          'CI/CD Pipelines & Automation',
          'Monitoring & Security Best Practices'
        ],
        5: [ // Cybersecurity
          'Network Security & Protocols',
          'Web Application Security Testing',
          'System Hardening & Configuration',
          'Incident Response & Forensics',
          'Ethical Hacking & Penetration Testing'
        ]
      };

      let moduleId = 1;
      for (let courseId = 1; courseId <= 5; courseId++) {
        for (let moduleIndex = 0; moduleIndex < 5; moduleIndex++) {
          // Calculate module start date (each module starts 2 weeks after the previous)
          const moduleStartDate = new Date(courseStartDates[courseId]);
          moduleStartDate.setDate(moduleStartDate.getDate() + (moduleIndex * 14));
          
          moduleData.push({
            id: moduleId,
            title: courseModules[courseId][moduleIndex],
            description: `Comprehensive module covering ${courseModules[courseId][moduleIndex].toLowerCase()} with hands-on projects and real-world applications.`,
            cohort_id: courseId,
            sequence_number: moduleIndex + 1,
            start_date: moduleStartDate,
            created_at: new Date(),
            updated_at: new Date()
          });
          moduleId++;
        }
      }

      await queryInterface.bulkInsert('modules', moduleData, { transaction });

      // 8. Create Content Items (Videos, Assignments, Resources, Events)
      console.log('🎥 Creating videos...');
      // Create Videos (4 per module = 100 total)
      const videoData = [];
      let videoId = 1;
      for (let moduleId = 1; moduleId <= 25; moduleId++) {
        for (let videoIndex = 1; videoIndex <= 4; videoIndex++) {
          videoData.push({
            id: videoId,
            title: `Video Lecture ${videoIndex} - Advanced Concepts`,
            description: `In-depth video covering key concepts and practical implementations with live coding examples.`,
            external_video_id: `video_${videoId}_${Math.random().toString(36).substr(2, 9)}`,
            created_at: new Date(),
            updated_at: new Date()
          });
          videoId++;
        }
      }
      await queryInterface.bulkInsert('videos', videoData, { transaction });

      console.log('📝 Creating assignments...');
      // Create Assignments (2 per module = 50 total)
      const assignmentData = [];
      let assignmentId = 1;
      for (let moduleId = 1; moduleId <= 25; moduleId++) {
        for (let assignmentIndex = 1; assignmentIndex <= 2; assignmentIndex++) {
          assignmentData.push({
            id: assignmentId,
            title: `Hands-on Assignment ${assignmentIndex}`,
            description: `Practical coding assignment to reinforce learning objectives and build portfolio projects.`,
            url: `https://assignments.platform.com/assignment/${assignmentId}`,
            created_at: new Date(),
            updated_at: new Date()
          });
          assignmentId++;
        }
      }
      await queryInterface.bulkInsert('assignments', assignmentData, { transaction });

      console.log('📚 Creating resources...');
      // Create Resources (2 per module = 50 total)
      const resourceData = [];
      let resourceId = 1;
      const resourceTypes = ['PDF', 'URL', 'IMAGE', 'TEXT'];
      for (let moduleId = 1; moduleId <= 25; moduleId++) {
        for (let resourceIndex = 1; resourceIndex <= 2; resourceIndex++) {
          resourceData.push({
            id: resourceId,
            title: `Essential Resource ${resourceIndex}`,
            description: `Curated learning resource including documentation, tutorials, and reference materials.`,
            url: `https://resources.platform.com/resource/${resourceId}`,
            type: resourceTypes[resourceId % 4],
            created_at: new Date(),
            updated_at: new Date()
          });
          resourceId++;
        }
      }
      await queryInterface.bulkInsert('resources', resourceData, { transaction });

      console.log('📅 Creating events...');
      // Create Events (2 per module = 50 total)
      const eventData = [];
      let eventId = 1;
      for (let moduleId = 1; moduleId <= 25; moduleId++) {
        for (let eventIndex = 1; eventIndex <= 2; eventIndex++) {
          const startTime = new Date();
          startTime.setDate(startTime.getDate() + (moduleId * 7) + (eventIndex * 3)); // Spread events over time
          startTime.setHours(10 + eventIndex, 0, 0, 0);
          
          const endTime = new Date(startTime);
          endTime.setHours(startTime.getHours() + 2); // 2-hour events
          
          eventData.push({
            id: eventId,
            title: `Live Session ${eventIndex} - Interactive Workshop`,
            description: `Interactive live session with Q&A, code reviews, and collaborative problem-solving.`,
            start_time: startTime,
            end_time: endTime,
            created_at: new Date(),
            updated_at: new Date()
          });
          eventId++;
        }
      }
      await queryInterface.bulkInsert('events', eventData, { transaction });

      // 9. Create Contents (linking modules to content items)
      console.log('🔗 Creating content associations...');
      const contentData = [];
      let contentId = 1;
      
      for (let moduleId = 1; moduleId <= 25; moduleId++) {
        let sequenceNumber = 1;
        
        // Determine which course this module belongs to
        const courseId = Math.ceil(moduleId / 5);
        const moduleIndexInCourse = ((moduleId - 1) % 5);
        
        // Calculate module start date (each module starts 2 weeks after the previous)
        const moduleStartDate = new Date(courseStartDates[courseId]);
        moduleStartDate.setDate(moduleStartDate.getDate() + (moduleIndexInCourse * 14));
        
        // Add 4 videos per module
        for (let videoIndex = 1; videoIndex <= 4; videoIndex++) {
          const videoContentId = ((moduleId - 1) * 4) + videoIndex;
          
          // Videos are spaced 2 days apart within a module
          const videoStartDate = new Date(moduleStartDate);
          videoStartDate.setDate(videoStartDate.getDate() + ((videoIndex - 1) * 2));
          
          contentData.push({
            id: contentId,
            content_id: videoContentId,
            content_type: 'VIDEO',
            sequence_number: sequenceNumber,
            start_date: videoStartDate,
            module_id: moduleId,
            created_at: new Date(),
            updated_at: new Date()
          });
          contentId++;
          sequenceNumber++;
        }
        
        // Add 2 assignments per module
        for (let assignmentIndex = 1; assignmentIndex <= 2; assignmentIndex++) {
          const assignmentContentId = ((moduleId - 1) * 2) + assignmentIndex;
          
          // Assignments start after videos (day 8 and 10)
          const assignmentStartDate = new Date(moduleStartDate);
          assignmentStartDate.setDate(assignmentStartDate.getDate() + 7 + ((assignmentIndex - 1) * 2));
          
          contentData.push({
            id: contentId,
            content_id: assignmentContentId,
            content_type: 'ASSIGNMENT',
            sequence_number: sequenceNumber,
            start_date: assignmentStartDate,
            module_id: moduleId,
            created_at: new Date(),
            updated_at: new Date()
          });
          contentId++;
          sequenceNumber++;
        }
        
        // Add 2 resources per module
        for (let resourceIndex = 1; resourceIndex <= 2; resourceIndex++) {
          const resourceContentId = ((moduleId - 1) * 2) + resourceIndex;
          
          // Resources are available from the start of the module
          const resourceStartDate = new Date(moduleStartDate);
          resourceStartDate.setDate(resourceStartDate.getDate() + ((resourceIndex - 1) * 1));
          
          contentData.push({
            id: contentId,
            content_id: resourceContentId,
            content_type: 'RESOURCE',
            sequence_number: sequenceNumber,
            start_date: resourceStartDate,
            module_id: moduleId,
            created_at: new Date(),
            updated_at: new Date()
          });
          contentId++;
          sequenceNumber++;
        }
        
        // Add 2 events per module
        for (let eventIndex = 1; eventIndex <= 2; eventIndex++) {
          const eventContentId = ((moduleId - 1) * 2) + eventIndex;
          
          // Events are scheduled at the end of the module (day 12 and 13)
          const eventStartDate = new Date(moduleStartDate);
          eventStartDate.setDate(eventStartDate.getDate() + 11 + ((eventIndex - 1) * 1));
          
          contentData.push({
            id: contentId,
            content_id: eventContentId,
            content_type: 'EVENT',
            sequence_number: sequenceNumber,
            start_date: eventStartDate,
            module_id: moduleId,
            created_at: new Date(),
            updated_at: new Date()
          });
          contentId++;
          sequenceNumber++;
        }
      }
      
      await queryInterface.bulkInsert('contents', contentData, { transaction });

      // 10. Create Enrollments (all 5 users enrolled in all 5 courses)
      console.log('🎓 Creating enrollments...');
      const enrollmentData = [];
      for (let userId = 1; userId <= 5; userId++) {
        for (let courseId = 1; courseId <= 5; courseId++) {
          enrollmentData.push({
            cohort_id: courseId, // Using course_id as course_id
            user_id: userId,
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }
      
      await queryInterface.bulkInsert('enrollments', enrollmentData, { transaction });

      // 11. Create Course Managers (assign some users as instructors)
      console.log('👨‍🏫 Creating course managers...');
      await queryInterface.bulkInsert('cohort_managers', [
        {
          user_id: 1,
          cohort_id: 1,
          type: 'INSTRUCTOR',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 2,
          cohort_id: 2,
          type: 'INSTRUCTOR',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 3,
          cohort_id: 3,
          type: 'INSTRUCTOR',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 4,
          cohort_id: 4,
          type: 'COURSE_MANAGER',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 5,
          cohort_id: 5,
          type: 'INSTRUCTOR',
          created_at: new Date(),
          updated_at: new Date()
        }
      ], { transaction });

      // 12. Create Content Links (link resources and assignments to first video in each module)
      console.log('🔗 Creating content links...');
      const contentLinksData = [];
      let linkId = 1;

      // Each module has 10 content items: 4 videos, 2 assignments, 2 resources, 2 events
      // Content IDs per module:
      //   Videos: (module-1)*10 + 1 to (module-1)*10 + 4
      //   Assignments: (module-1)*10 + 5 to (module-1)*10 + 6
      //   Resources: (module-1)*10 + 7 to (module-1)*10 + 8
      //   Events: (module-1)*10 + 9 to (module-1)*10 + 10
      for (let moduleId = 1; moduleId <= 25; moduleId++) {
        const moduleBase = (moduleId - 1) * 10;
        const firstVideoContentId = moduleBase + 1; // First video in the module

        // Link 2 resources to first video
        for (let r = 1; r <= 2; r++) {
          const resourceContentId = moduleBase + 6 + r; // Resources are at positions 7 and 8
          contentLinksData.push({
            id: linkId++,
            source_content_id: firstVideoContentId,
            linked_content_id: resourceContentId,
            link_type: 'RESOURCE',
            sequence_number: r,
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        // Link 2 assignments to first video
        for (let a = 1; a <= 2; a++) {
          const assignmentContentId = moduleBase + 4 + a; // Assignments are at positions 5 and 6
          contentLinksData.push({
            id: linkId++,
            source_content_id: firstVideoContentId,
            linked_content_id: assignmentContentId,
            link_type: 'ASSIGNMENT',
            sequence_number: a,
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      }

      await queryInterface.bulkInsert('content_links', contentLinksData, { transaction });

      // 13. Create Announcements for each course
      console.log('📢 Creating announcements...');

      const announcementData = [
        // Course 1: Full Stack Web Development
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Welcome to Full Stack Web Development!',
          body_html: '<p>Welcome everyone! We are excited to kick off this bootcamp. Please make sure you have Node.js and VS Code installed before the first session.</p>',
          body_preview: 'Welcome everyone! We are excited to kick off this bootcamp. Please make sure you have Node.js and VS Code installed before the first session.',
          image_url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
          author_user_id: 1,
          expiry_at: null,
          created_at: new Date('2024-02-01T09:00:00Z'),
          updated_at: new Date('2024-02-01T09:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'React Project Showcase - Submit by Friday',
          body_html: '<p>Reminder: Your React capstone project is due this Friday. Please push your final code to GitHub and share the deployed link in the Slack channel.</p>',
          body_preview: 'Reminder: Your React capstone project is due this Friday. Please push your final code to GitHub and share the deployed link in the Slack channel.',
          image_url: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800',
          author_user_id: 1,
          expiry_at: null,
          created_at: new Date('2024-03-15T10:00:00Z'),
          updated_at: new Date('2024-03-15T10:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Guest Lecture: Building Scalable APIs',
          body_html: '<p>We have a special guest lecture this Thursday on building scalable REST APIs with Express.js and PostgreSQL. Don\'t miss it!</p>',
          body_preview: 'We have a special guest lecture this Thursday on building scalable REST APIs with Express.js and PostgreSQL. Don\'t miss it!',
          image_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
          author_user_id: 1,
          expiry_at: null,
          created_at: new Date('2024-04-01T08:00:00Z'),
          updated_at: new Date('2024-04-01T08:00:00Z')
        },

        // Course 2: Data Science & Machine Learning
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Welcome to Data Science & ML Mastery!',
          body_html: '<p>Hello data enthusiasts! Make sure you have Python 3.10+ and Jupyter Notebook set up. We\'ll start with pandas and NumPy fundamentals.</p>',
          body_preview: 'Hello data enthusiasts! Make sure you have Python 3.10+ and Jupyter Notebook set up. We\'ll start with pandas and NumPy fundamentals.',
          image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
          author_user_id: 2,
          expiry_at: null,
          created_at: new Date('2024-03-01T10:00:00Z'),
          updated_at: new Date('2024-03-01T10:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Kaggle Competition - Join Our Team!',
          body_html: '<p>We\'re forming teams for the upcoming Kaggle competition on housing price prediction. Sign up in the #kaggle Slack channel by Wednesday.</p>',
          body_preview: 'We\'re forming teams for the upcoming Kaggle competition on housing price prediction. Sign up in the #kaggle Slack channel by Wednesday.',
          image_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800',
          author_user_id: 2,
          expiry_at: null,
          created_at: new Date('2024-04-10T09:00:00Z'),
          updated_at: new Date('2024-04-10T09:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'New Dataset Released for ML Project',
          body_html: '<p>The cleaned dataset for your machine learning capstone project is now available in the shared Google Drive folder. Start exploring!</p>',
          body_preview: 'The cleaned dataset for your machine learning capstone project is now available in the shared Google Drive folder. Start exploring!',
          image_url: 'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=800',
          author_user_id: 2,
          expiry_at: null,
          created_at: new Date('2024-05-20T11:00:00Z'),
          updated_at: new Date('2024-05-20T11:00:00Z')
        },

        // Course 3: Mobile App Development
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Welcome to Mobile App Development!',
          body_html: '<p>Welcome to the React Native course! Please install Expo CLI and set up either an Android emulator or iOS simulator before our first hands-on session.</p>',
          body_preview: 'Welcome to the React Native course! Please install Expo CLI and set up either an Android emulator or iOS simulator before our first hands-on session.',
          image_url: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800',
          author_user_id: 3,
          expiry_at: null,
          created_at: new Date('2024-04-15T09:30:00Z'),
          updated_at: new Date('2024-04-15T09:30:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'App Store Submission Workshop',
          body_html: '<p>Join us for a live workshop on submitting your app to the Apple App Store and Google Play Store. We\'ll cover certificates, screenshots, and review guidelines.</p>',
          body_preview: 'Join us for a live workshop on submitting your app to the Apple App Store and Google Play Store. We\'ll cover certificates, screenshots, and review guidelines.',
          image_url: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800',
          author_user_id: 3,
          expiry_at: null,
          created_at: new Date('2024-06-01T10:00:00Z'),
          updated_at: new Date('2024-06-01T10:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'UI/UX Design Resources Updated',
          body_html: '<p>We\'ve updated the Figma component library with new mobile UI patterns. Check out the navigation templates and form components for your projects.</p>',
          body_preview: 'We\'ve updated the Figma component library with new mobile UI patterns. Check out the navigation templates and form components for your projects.',
          image_url: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=800',
          author_user_id: 3,
          expiry_at: null,
          created_at: new Date('2024-05-10T14:00:00Z'),
          updated_at: new Date('2024-05-10T14:00:00Z')
        },

        // Course 4: Cloud Architecture & DevOps
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Welcome to Cloud & DevOps Engineering!',
          body_html: '<p>Welcome aboard! Create your AWS Free Tier account and install Docker Desktop before the first lab. We\'ll hit the ground running with EC2 and S3.</p>',
          body_preview: 'Welcome aboard! Create your AWS Free Tier account and install Docker Desktop before the first lab. We\'ll hit the ground running with EC2 and S3.',
          image_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
          author_user_id: 4,
          expiry_at: null,
          created_at: new Date('2024-05-01T08:00:00Z'),
          updated_at: new Date('2024-05-01T08:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Kubernetes Cluster Lab Access Ready',
          body_html: '<p>Your personal Kubernetes cluster credentials have been sent to your email. Please verify access by running kubectl get nodes before Thursday\'s session.</p>',
          body_preview: 'Your personal Kubernetes cluster credentials have been sent to your email. Please verify access by running kubectl get nodes before Thursday\'s session.',
          image_url: 'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=800',
          author_user_id: 4,
          expiry_at: null,
          created_at: new Date('2024-06-15T09:00:00Z'),
          updated_at: new Date('2024-06-15T09:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'CI/CD Pipeline Challenge',
          body_html: '<p>This week\'s challenge: Build a complete CI/CD pipeline using GitHub Actions that deploys to AWS ECS. Best implementations will be featured in our showcase.</p>',
          body_preview: 'This week\'s challenge: Build a complete CI/CD pipeline using GitHub Actions that deploys to AWS ECS. Best implementations will be featured in our showcase.',
          image_url: 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=800',
          author_user_id: 4,
          expiry_at: null,
          created_at: new Date('2024-07-01T08:30:00Z'),
          updated_at: new Date('2024-07-01T08:30:00Z')
        },

        // Course 5: Cybersecurity
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Welcome to Cybersecurity Fundamentals!',
          body_html: '<p>Welcome future security professionals! Set up your Kali Linux VM and create a TryHackMe account. We\'ll start with network scanning basics.</p>',
          body_preview: 'Welcome future security professionals! Set up your Kali Linux VM and create a TryHackMe account. We\'ll start with network scanning basics.',
          image_url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800',
          author_user_id: 5,
          expiry_at: null,
          created_at: new Date('2024-06-01T09:00:00Z'),
          updated_at: new Date('2024-06-01T09:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'CTF Competition This Weekend',
          body_html: '<p>We\'re hosting a Capture The Flag competition this Saturday. Teams of 3-4. Register in the Discord channel. Prizes for top 3 teams!</p>',
          body_preview: 'We\'re hosting a Capture The Flag competition this Saturday. Teams of 3-4. Register in the Discord channel. Prizes for top 3 teams!',
          image_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800',
          author_user_id: 5,
          expiry_at: null,
          created_at: new Date('2024-07-15T10:00:00Z'),
          updated_at: new Date('2024-07-15T10:00:00Z')
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          title: 'Security Lab Environment Updated',
          body_html: '<p>The vulnerable web application lab has been updated with new OWASP Top 10 challenges. Access it through the VPN using your credentials.</p>',
          body_preview: 'The vulnerable web application lab has been updated with new OWASP Top 10 challenges. Access it through the VPN using your credentials.',
          image_url: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800',
          author_user_id: 5,
          expiry_at: null,
          created_at: new Date('2024-08-01T11:00:00Z'),
          updated_at: new Date('2024-08-01T11:00:00Z')
        }
      ];

      // Insert announcements one at a time since gen_random_uuid() is used for id
      const announcementIds = [];
      for (const ann of announcementData) {
        const [inserted] = await queryInterface.sequelize.query(
          `INSERT INTO announcements (id, title, body_html, body_preview, image_url, author_user_id, expiry_at, created_at, updated_at)
           VALUES (gen_random_uuid(), :title, :body_html, :body_preview, :image_url, :author_user_id, :expiry_at, :created_at, :updated_at)
           RETURNING id`,
          {
            replacements: {
              title: ann.title,
              body_html: ann.body_html,
              body_preview: ann.body_preview,
              image_url: ann.image_url,
              author_user_id: ann.author_user_id,
              expiry_at: ann.expiry_at,
              created_at: ann.created_at,
              updated_at: ann.updated_at
            },
            type: Sequelize.QueryTypes.INSERT,
            transaction
          }
        );
        announcementIds.push(inserted[0].id);
      }

      // 14. Create AnnouncementCourse entries (3 announcements per course)
      console.log('🔗 Linking announcements to courses...');
      const announcementCourseData = [];
      for (let i = 0; i < announcementIds.length; i++) {
        const courseId = Math.floor(i / 3) + 1; // 3 announcements per course
        announcementCourseData.push({
          id: Sequelize.literal("gen_random_uuid()"),
          announcement_id: announcementIds[i],
          cohort_id: courseId,
          is_home: true,
          is_pinned: i % 3 === 0, // Pin the first announcement of each course
          pinned_at: i % 3 === 0 ? new Date() : null,
          attached_at: announcementData[i].created_at,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      for (const ac of announcementCourseData) {
        await queryInterface.sequelize.query(
          `INSERT INTO announcement_cohorts (id, announcement_id, cohort_id, is_home, is_pinned, pinned_at, attached_at, created_at, updated_at)
           VALUES (gen_random_uuid(), :announcement_id, :cohort_id, :is_home, :is_pinned, :pinned_at, :attached_at, :created_at, :updated_at)`,
          {
            replacements: {
              announcement_id: ac.announcement_id,
              cohort_id: ac.cohort_id,
              is_home: ac.is_home,
              is_pinned: ac.is_pinned,
              pinned_at: ac.pinned_at,
              attached_at: ac.attached_at,
              created_at: ac.created_at,
              updated_at: ac.updated_at
            },
            type: Sequelize.QueryTypes.INSERT,
            transaction
          }
        );
      }

      await transaction.commit();
      
      console.log('\n🎉 ✅ COMPLETE CURRICULUM SETUP SUCCESSFUL! ✅ 🎉\n');
      console.log('📊 SUMMARY OF CREATED DATA:');
      console.log('═══════════════════════════════════════════════════');
      console.log('📚 Courses:              5');
      console.log('👥 Users:                5 (with metadata)');
      console.log('🛠️  Tools:               5 (VS Code, GitHub, Figma, Postman, Docker)');
      console.log('💬 Community Links:      15 (3 per course: Slack, WhatsApp, Discord)');
      console.log('🔗 Course-Tool Links:    25 (all tools for all courses)');
      console.log('📖 Modules:              25 (5 per course)');
      console.log('🎥 Videos:               100 (4 per module)');
      console.log('📝 Assignments:          50 (2 per module)');
      console.log('📚 Resources:            50 (2 per module)');
      console.log('📅 Events:               50 (2 per module)');
      console.log('🔗 Content Links:        100 (4 per module: 2 resources + 2 assignments linked to first video)');
      console.log('🔗 Content Links:        250 (10 per module)');
      console.log('🎓 Enrollments:          25 (all users in all courses)');
      console.log('👨‍🏫 Course Managers:     5 (instructors for each course)');
      console.log('📢 Announcements:        15 (3 per course, with Unsplash images)');
      console.log('🔗 Announcement-Courses: 15 (1 board per announcement)');
      console.log('═══════════════════════════════════════════════════');
      console.log('📈 TOTAL RECORDS:        ~705 records across all tables');
      console.log('');
      console.log('🚀 Your learning platform is now fully populated and ready!');
      console.log('🌐 You can now test all APIs with rich, realistic data.');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Complete curriculum setup failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🧹 Cleaning up all seeded data...');
      
      // Delete in reverse order to handle foreign key constraints
      await queryInterface.bulkDelete('announcement_reads', null, { transaction });
      await queryInterface.bulkDelete('announcement_cohorts', null, { transaction });
      await queryInterface.bulkDelete('announcements', null, { transaction });
      await queryInterface.bulkDelete('content_links', null, { transaction });
      await queryInterface.bulkDelete('cohort_managers', null, { transaction });
      await queryInterface.bulkDelete('enrollments', null, { transaction });
      await queryInterface.bulkDelete('contents', null, { transaction });
      await queryInterface.bulkDelete('events', null, { transaction });
      await queryInterface.bulkDelete('resources', null, { transaction });
      await queryInterface.bulkDelete('assignments', null, { transaction });
      await queryInterface.bulkDelete('videos', null, { transaction });
      await queryInterface.bulkDelete('modules', null, { transaction });
      await queryInterface.bulkDelete('cohort_tools', null, { transaction });
      await queryInterface.bulkDelete('community_links', null, { transaction });
      await queryInterface.bulkDelete('tools', null, { transaction });
      await queryInterface.bulkDelete('user_metadata', null, { transaction });
      await queryInterface.bulkDelete('users', null, { transaction });
      await queryInterface.bulkDelete('cohorts', null, { transaction });
      
      await transaction.commit();
      console.log('✅ All seeded data removed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};
