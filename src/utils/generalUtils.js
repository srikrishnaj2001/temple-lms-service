// Constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

const getPaginationParams = (page, limit) => {
  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);
  
  const validPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
  const validLimit = Number.isInteger(parsedLimit) && parsedLimit >= MIN_LIMIT 
    ? Math.min(parsedLimit, MAX_LIMIT) 
    : DEFAULT_LIMIT;
  
  const offset = (validPage - 1) * validLimit;
  
  return {
    page: validPage,
    limit: validLimit,
    offset
  };
};

const excludedAttributes = [
  'createdAt','updatedAt','deletedAt'
]

module.exports = {
  getPaginationParams,
  excludedAttributes,
};