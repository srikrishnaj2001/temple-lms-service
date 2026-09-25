const { Form, FormQuestion, FormResponse, Cohort, Enrollment, User, sequelize } = require('../../models');
const { Op } = require('sequelize');

class FormService {

  // ==================== FORM RESPONSES (User) ====================

  // Submit form responses
  async submitFormResponses(enrollmentId, responses, userEmail) {
    const transaction = await sequelize.transaction();

    try {
      // Verify user owns this enrollment
      const user = await User.findOne({ where: { email: userEmail } });
      if (!user) {
        await transaction.rollback();
        return {
          success: false,
          error: 'User not found'
        };
      }

      const enrollment = await Enrollment.findOne({
        where: { id: enrollmentId, user_id: user.id }
      });

      if (!enrollment) {
        await transaction.rollback();
        return {
          success: false,
          error: 'Enrollment not found or does not belong to user'
        };
      }

      // responses should be an array of { form_question_id, response }
      const createdResponses = [];

      for (const item of responses) {
        const { form_question_id, response } = item;

        // Verify question exists and belongs to a form for this course
        const question = await FormQuestion.findByPk(form_question_id, {
          include: [{
            model: Form,
            as: 'form',
            where: { cohort_id: enrollment.cohort_id }
          }]
        });

        if (!question) {
          await transaction.rollback();
          return {
            success: false,
            error: `Invalid question ID: ${form_question_id}`
          };
        }

        // Validate response based on question type
        if (question.type === 'SELECT' && question.options) {
          if (!question.options.includes(response)) {
            await transaction.rollback();
            return {
              success: false,
              error: `Invalid response for question ${form_question_id}. Must be one of: ${question.options.join(', ')}`
            };
          }
        }

        let finalResponse = response;

        if (question.type === 'MULTISELECT' && question.options) {
          let responseArray;
          try {
            responseArray = typeof response === 'string' ? JSON.parse(response) : response;
          } catch {
            responseArray = [response];
          }

          if (!Array.isArray(responseArray)) {
            await transaction.rollback();
            return {
              success: false,
              error: `Response for MULTISELECT question ${form_question_id} must be an array`
            };
          }

          // Deduplicate the array
          responseArray = [...new Set(responseArray)];

          for (const r of responseArray) {
            if (!question.options.includes(r)) {
              await transaction.rollback();
              return {
                success: false,
                error: `Invalid option "${r}" for question ${form_question_id}`
              };
            }
          }

          // Use deduplicated array as final response
          finalResponse = responseArray;
        }

        // Upsert response (update if exists, create if not)
        const [formResponse, created] = await FormResponse.upsert({
          form_question_id,
          enrollment_id: enrollmentId,
          response: typeof finalResponse === 'object' ? JSON.stringify(finalResponse) : finalResponse
        }, {
          transaction,
          returning: true,
          conflictFields: ['form_question_id', 'enrollment_id']
        });

        createdResponses.push({
          ...formResponse.toJSON(),
          created
        });
      }

      await transaction.commit();

      return {
        success: true,
        data: createdResponses,
        message: 'Responses submitted successfully'
      };
    } catch (error) {
      await transaction.rollback();
      console.error('Error submitting form responses:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get forms for a course (to include in course API response)
  // Only returns forms that:
  // - Are enabled
  // - Have trigger_date in the past (active)
  // - Have at least one question
  // - Are not fully completed (if enrollmentId provided)
  async getFormsForCourse(courseId, enrollmentId = null) {
    try {
      const now = new Date();

      const forms = await Form.findAll({
        where: {
          cohort_id: courseId,
          is_enabled: true,
          trigger_date: { [Op.lte]: now }  // Only forms where trigger_date has passed
        },
        attributes: ['id', 'form_type', 'trigger_date', 'is_enabled'],
        include: [{
          model: FormQuestion,
          as: 'questions',
          attributes: ['id', 'question', 'type', 'options', 'sequence_number'],
          order: [['sequence_number', 'ASC']]
        }],
        order: [['trigger_date', 'ASC']]
      });

      // Convert to plain JSON to avoid Sequelize instance issues
      const formsJson = forms.map(f => f.toJSON());

      // Filter out forms with no questions
      const formsWithQuestions = formsJson.filter(form => form.questions && form.questions.length > 0);

      // If no enrollmentId, return forms with questions (no completion check)
      if (!enrollmentId) {
        return formsWithQuestions;
      }

      // With enrollmentId: add responses and filter out completed forms
      const pendingForms = [];

      for (const form of formsWithQuestions) {
        const questionIds = form.questions.map(q => q.id);

        const existingResponses = await FormResponse.findAll({
          where: {
            enrollment_id: enrollmentId,
            form_question_id: { [Op.in]: questionIds }
          },
          attributes: ['form_question_id', 'response']
        });

        // Skip fully completed forms
        if (existingResponses.length >= form.questions.length) {
          continue;
        }

        const responseMap = {};
        existingResponses.forEach(r => {
          responseMap[r.form_question_id] = r.response;
        });

        // Add existingResponse to each question
        form.questions = form.questions.map(q => ({
          ...q,
          existingResponse: responseMap[q.id] || null
        }));

        // Add response stats
        form.answeredCount = existingResponses.length;
        form.totalQuestions = form.questions.length;

        pendingForms.push(form);
      }

      return pendingForms;
    } catch (error) {
      console.error('Error fetching forms for course:', error);
      return [];
    }
  }

  // Check if user has pending forms for enrollment
  async hasPendingForms(enrollmentId) {
    try {
      const enrollment = await Enrollment.findByPk(enrollmentId);
      if (!enrollment) return false;

      const now = new Date();

      const forms = await Form.findAll({
        where: {
          cohort_id: enrollment.cohort_id,
          is_enabled: true,
          trigger_date: { [Op.lte]: now }
        },
        include: [{
          model: FormQuestion,
          as: 'questions',
          attributes: ['id']
        }]
      });

      for (const form of forms) {
        if (form.questions.length === 0) continue;

        const answeredCount = await FormResponse.count({
          where: {
            enrollment_id: enrollmentId,
            form_question_id: { [Op.in]: form.questions.map(q => q.id) }
          }
        });

        if (answeredCount < form.questions.length) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking pending forms:', error);
      return false;
    }
  }
}

module.exports = new FormService();
