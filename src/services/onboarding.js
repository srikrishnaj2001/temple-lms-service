'use strict';

const {
  Course,
  CourseRole,
  Enrollment,
  Role,
  User,
  UserRole,
  sequelize
} = require('../../models');

function normalizeEmail(email) {
  return User.normalizeEmail(email || '');
}

function roleLabel(name) {
  return String(name || '')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function getUserByEmail(email) {
  return User.findOne({
    where: { email: normalizeEmail(email) },
    include: [{
      model: Role,
      as: 'roles',
      through: { attributes: [] },
      required: false
    }]
  });
}

async function getStatus(email) {
  const user = await getUserByEmail(email);

  if (!user) {
    return {
      exists: false,
      needsOnboarding: true,
      user: null,
      roles: []
    };
  }

  const roles = (user.roles || []).map((role) => ({
    id: role.id,
    name: role.name,
    label: roleLabel(role.name)
  }));

  return {
    exists: true,
    needsOnboarding: !user.onboardingSkipped && (roles.length === 0 || !user.phone),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      imageUrl: user.imageUrl || null,
      onboardingSkipped: Boolean(user.onboardingSkipped)
    },
    roles
  };
}

async function listRoles() {
  const roles = await Role.findAll({
    attributes: ['id', 'name'],
    order: [['name', 'ASC']]
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    label: roleLabel(role.name)
  }));
}

async function completeOnboarding(email, payload) {
  const cleanEmail = normalizeEmail(email);
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  const roleIds = Array.isArray(payload.roleIds)
    ? payload.roleIds.map((id) => Number(id)).filter(Number.isInteger)
    : [];

  if (!cleanEmail) {
    const error = new Error('User email is required');
    error.status = 400;
    throw error;
  }
  if (!name) {
    const error = new Error('Name is required');
    error.status = 400;
    throw error;
  }
  if (!phone) {
    const error = new Error('Phone number is required');
    error.status = 400;
    throw error;
  }
  if (roleIds.length === 0) {
    const error = new Error('Select at least one role');
    error.status = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    const roles = await Role.findAll({
      where: { id: roleIds },
      transaction
    });

    if (roles.length !== new Set(roleIds).size) {
      const error = new Error('One or more selected roles are invalid');
      error.status = 400;
      throw error;
    }

    let user = await User.findOne({
      where: { email: cleanEmail },
      paranoid: false,
      transaction
    });

    if (!user) {
      user = await User.create({ name, email: cleanEmail, phone, onboardingSkipped: false }, { transaction });
    }

    await user.update(
      { name, phone, onboardingSkipped: false, deletedAt: null },
      { transaction, paranoid: false }
    );

    await UserRole.destroy({
      where: { userId: user.id },
      transaction
    });
    await UserRole.bulkCreate(
      roleIds.map((roleId) => ({ userId: user.id, roleId })),
      { transaction, ignoreDuplicates: true }
    );

    const courses = await Course.findAll({
      attributes: ['id'],
      transaction
    });

    await Enrollment.bulkCreate(
      courses.map((course) => ({
        userId: user.id,
        courseId: course.id
      })),
      {
        transaction,
        ignoreDuplicates: true
      }
    );

    const roleCourseRows = await CourseRole.findAll({
      where: { roleId: roleIds },
      attributes: ['courseId', 'roleId'],
      transaction
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        imageUrl: user.imageUrl || null
      },
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        label: roleLabel(role.name)
      })),
      enrolledCourseCount: courses.length,
      roleCourseIds: Array.from(new Set(roleCourseRows.map((row) => row.courseId)))
    };
  });
}

async function skipOnboarding(email, payload = {}) {
  const cleanEmail = normalizeEmail(email);
  const fallbackName = cleanEmail ? cleanEmail.split('@')[0] : 'Devotee';
  const name = String(payload.name || fallbackName).trim();

  if (!cleanEmail) {
    const error = new Error('User email is required');
    error.status = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    let user = await User.findOne({
      where: { email: cleanEmail },
      paranoid: false,
      transaction
    });

    if (!user) {
      user = await User.create({
        name,
        email: cleanEmail,
        phone: null,
        onboardingSkipped: true
      }, { transaction });
    }

    await user.update(
      {
        name: user.name || name,
        onboardingSkipped: true,
        deletedAt: null
      },
      { transaction, paranoid: false }
    );

    await UserRole.destroy({
      where: { userId: user.id },
      transaction
    });

    const courses = await Course.findAll({
      attributes: ['id'],
      transaction
    });

    await Enrollment.bulkCreate(
      courses.map((course) => ({
        userId: user.id,
        courseId: course.id
      })),
      {
        transaction,
        ignoreDuplicates: true
      }
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        imageUrl: user.imageUrl || null,
        onboardingSkipped: true
      },
      roles: [],
      enrolledCourseCount: courses.length
    };
  });
}

module.exports = {
  completeOnboarding,
  getStatus,
  listRoles,
  skipOnboarding
};
