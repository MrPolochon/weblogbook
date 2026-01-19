export const ATC_POSITIONS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center'] as const;
export type AtcPosition = (typeof ATC_POSITIONS)[number];
