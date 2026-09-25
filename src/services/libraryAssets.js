'use strict';
const { Audio, Read, Content } = require('../../models');
const { Op } = require('sequelize');
const { assetPayload } = require('../utils/lessonContent');
const models = { audios: Audio, reads: Read };
const kinds = { audios: 'AUDIO', reads: 'READ' };

module.exports = {
  async list(collection, query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 50));
    const where = query.q ? { title: { [Op.iLike]: `%${query.q}%` } } : {};
    const { rows, count } = await models[collection].findAndCountAll({ where, limit, offset: (page - 1) * limit, order: [['id', 'DESC']] });
    return { success: true, data: { [collection]: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } } };
  },
  async save(collection, id, data) {
    const payload = assetPayload(data, kinds[collection]);
    let record;
    if (id) {
      record = await models[collection].findByPk(id);
      if (!record) throw new Error('Content not found');
      if (collection === 'audios' && !(payload.externalAudioId === undefined ? record.externalAudioId : payload.externalAudioId) && !(payload.url === undefined ? record.url : payload.url)) throw new Error('A Gumlet asset ID or audio URL is required');
      await record.update(payload);
    } else {
      if (!payload.title || (collection === 'audios' ? !payload.url && !payload.externalAudioId : !payload.body)) throw new Error('Title and content are required');
      record = await models[collection].create(payload);
    }
    return { success: true, data: record };
  },
  async remove(collection, id) {
    const references = await Content.count({ where: { contentType: kinds[collection], contentId: id } });
    if (references) throw new Error(`This item is used in ${references} lesson(s). Remove those placements first.`);
    if (!(await models[collection].destroy({ where: { id } }))) throw new Error('Content not found');
    return { success: true };
  },
};
