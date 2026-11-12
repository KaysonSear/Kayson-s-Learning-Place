/**
 * Top-level study fields. Each field will own its own knowledge points and question bank;
 * the current library is the Coding · C field. Unavailable fields are listed as upcoming.
 */
export const fields = [
  {id:'coding-c', title:'Coding · C', available:true},
  {id:'data-science', title:'Data Science', available:false},
  {id:'coding-ts', title:'Coding · TypeScript', available:false}
] as const;

export const currentField = fields[0];
