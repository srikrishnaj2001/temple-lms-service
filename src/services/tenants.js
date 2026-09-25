'use strict';

const { Tenant, sequelize } = require('../../models');

class TenantService {
  async getAllTenants() {
    try {
      const tenants = await Tenant.findAll({
        attributes: ['id', 'domain', 'name', 'createdAt', 'updatedAt'],
        order: [['name', 'ASC']]
      });
      return { success: true, data: { tenants } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch tenants' };
    }
  }

  async getTenantById(id) {
    try {
      const tenant = await Tenant.findByPk(id);
      if (!tenant) return { success: false, message: 'Tenant not found' };
      return { success: true, data: tenant };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch tenant' };
    }
  }

  async createTenant(data) {
    try {
      const tenant = await Tenant.create({
        domain: data.domain,
        name: data.name
      });
      return { success: true, data: tenant, message: 'Tenant created successfully' };
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return { success: false, error: 'A tenant with this domain already exists' };
      }
      return { success: false, error: error.message, message: 'Failed to create tenant' };
    }
  }

  async updateTenant(id, data) {
    try {
      const tenant = await Tenant.findByPk(id);
      if (!tenant) return { success: false, message: 'Tenant not found' };
      await tenant.update({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.domain !== undefined && { domain: data.domain })
      });
      return { success: true, data: tenant, message: 'Tenant updated successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update tenant' };
    }
  }
}

module.exports = new TenantService();
