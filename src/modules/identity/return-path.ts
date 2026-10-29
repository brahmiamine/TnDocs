/** Only public catalogue destinations may survive authentication. */
export function safePostAuthPath(value:unknown,locale:'fr'|'ar'):string|null{return typeof value==='string'&&new RegExp(`^/${locale}/catalogue/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,'i').test(value)?value:null;}
