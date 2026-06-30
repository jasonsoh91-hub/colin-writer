// Persona registry — editor identities the dashboard can switch between.
// Colin = fully wired. B/C/D = placeholder stubs until profiles are loaded.

export interface Persona {
  id: string;
  name: string;       // display name e.g. "Colin Gomez"
  label: string;      // short tag e.g. "Colin Writer"
  publication?: string;
  active: boolean;    // false = stub
}

export const PERSONAS: Persona[] = [
  { id: 'colin',      name: 'Colin Gomez',  label: 'Colin Writer',                    publication: 'Palate Asia',         active: true },
  { id: 'cnn-travel', name: 'CNN Travel',   label: 'CNN Travel Writer',               publication: 'CNN Travel',          active: true },
  { id: 'editor-c',   name: 'CNN Travel +SN', label: 'CNN Travel Writer (Test slot)', publication: 'CNN Travel',          active: true },
  { id: 'editor-d',   name: 'Editor D',     label: 'Editor D Writer',                                                     active: false },
];

export const DEFAULT_PERSONA_ID = 'colin';

export function getPersona(id: string): Persona {
  return PERSONAS.find(p => p.id === id) ?? PERSONAS[0];
}
