export type StoryNode = {
  id: string;
  title: string;
  text: string;
  links: string[];
  updatedAt: number;
};
export type Workspace = { activeId: string; nodes: StoryNode[] };
export const STORAGE_KEY = 'storyspace.mobile-story.v2';
const LEGACY_KEY = 'storyspace.mobile-notebook.v1';
export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const paragraphs = [
  'O 03:17 wszystkie zegary na peronie zatrzymały się równocześnie.\n\nPociąg wjechał bez świateł. Nie było słychać silnika ani kół, tylko cichy szum dobiegający spod torów.\n\nNa tablicy odjazdów pojawiło się jedno słowo:\n\nWRACAJ.',
  'Przejście techniczne było węższe, niż pamiętałam. Po obu stronach drżały metalowe drzwi.\n\nZa ścianą coś wystukiwało nierówny rytm. Trzy uderzenia. Przerwa. Dwa kolejne.\n\nZatrzymałam się przy numerze 19. Pod farbą ktoś wydrapał moje imię.',
  'Radio zaczęło szumieć, choć baterie wyjęłam godzinę temu.\n\n— Nie otwieraj drzwi — powiedział głos.\n\nBył mój. Starszy o wiele lat.\n\nW korytarzu zapaliła się pojedyncza lampa.',
  'Klamka była lodowata. Za drzwiami rozciągała się pusta sala pełna monitorów.\n\nNa każdym ekranie widziałam to samo: peron, na którym stałam kilka minut wcześniej.\n\nNa jednym z obrazów wciąż tam byłam.',
  'Na dachu wieży wiatr poruszał zerwaną anteną. Miasto pod nami milczało.\n\nZnalazłam nadajnik i kartkę z jednym zdaniem:\n\n„Jeśli słyszysz ten sygnał, historia jeszcze się nie skończyła.”',
];

export function makeDemo(): Workspace {
  const updatedAt = Date.now();
  const nodes: StoryNode[] = [
    { id: 'platform', title: 'Peron o 03:17', text: paragraphs[0]!, links: ['corridor'], updatedAt },
    { id: 'corridor', title: 'Tunel serwisowy', text: paragraphs[1]!, links: ['signal', 'door'], updatedAt },
    { id: 'signal', title: 'Sygnał z dołu', text: paragraphs[2]!, links: ['tower'], updatedAt },
    { id: 'door', title: 'Drzwi numer 19', text: paragraphs[3]!, links: ['tower'], updatedAt },
    { id: 'tower', title: 'Wieża transmisyjna', text: paragraphs[4]!, links: [], updatedAt },
  ];
  return { activeId: 'corridor', nodes };
}

function validWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== 'object' || !('nodes' in value) || !Array.isArray(value.nodes)) return null;
  const nodes = value.nodes.filter((n): n is StoryNode =>
    !!n && typeof n.id === 'string' && typeof n.title === 'string'
    && typeof n.text === 'string' && Array.isArray(n.links)
    && n.links.every((id: unknown) => typeof id === 'string') && typeof n.updatedAt === 'number',
  );
  if (!nodes.length) return null;
  const activeId = 'activeId' in value && typeof value.activeId === 'string'
    && nodes.some((n) => n.id === value.activeId) ? value.activeId : nodes[0]!.id;
  return { nodes, activeId };
}

export function loadWorkspace(): Workspace {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = validWorkspace(JSON.parse(stored));
      if (parsed) return parsed;
    }
  } catch { /* Malformed or inaccessible storage. */ }

  // Previous notes are carried forward, without touching their original storage key.
  const demo = makeDemo();
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return demo;
    const value = JSON.parse(legacy);
    if (!Array.isArray(value?.notes)) return demo;
    const oldNotes = value.notes.filter((n: unknown): n is { id: string; text: string; updatedAt: number } =>
      !!n && typeof n === 'object' && 'id' in n && typeof n.id === 'string'
      && 'text' in n && typeof n.text === 'string'
      && 'updatedAt' in n && typeof n.updatedAt === 'number',
    );
    if (oldNotes.length) {
      demo.nodes.push(...oldNotes.map((note) => ({
        id: `legacy-${note.id}`,
        title: note.text.split(/\r?\n/).find((line) => line.trim())?.slice(0, 70) || 'Wcześniejsza notatka',
        text: note.text,
        links: [],
        updatedAt: note.updatedAt,
      })));
    }
  } catch { /* Existing data is not deleted. */ }
  return demo;
}
