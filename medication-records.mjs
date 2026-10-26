// STAR medication history model. Older medication entries are active by default.
export function normalizedMedication(m) { return { ...(m || {}), status: m?.status === 'discontinued' ? 'discontinued' : 'active' }; }
