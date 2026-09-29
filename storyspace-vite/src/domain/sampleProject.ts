import type { Project } from './types';

const now = new Date().toISOString();
const rawNodes = [
  ['n01','The platform before dawn','The city is still asleep when Mara reaches the empty platform. Rain hangs in the air like dust.',0,120,214],
  ['n02','A message with no sender','Her phone vibrates once. The message contains only a time, a station number, and a sentence she remembers from childhood.',300,120,226],
  ['n03','The closed station','Gate 7 should have been sealed for years. Tonight, the lock is open.',600,120,236],
  ['n04','Where the path divides','Below the stairs, the corridor splits. Warm market light flickers to the right. The old service tunnel breathes cold air from the left.',900,120,248],
  ['n05','The service tunnel','The tiles give way to wet concrete. Someone has drawn a white line along the wall, always just above eye level.',1200,-40,263],
  ['n06','The night market','Every stall is open, but no one is selling anything. The vendors watch a silent television suspended above the aisle.',1200,280,22],
  ['n07','Under the bridge','Both routes return to the river. A figure waits under the railway bridge, holding the same umbrella Mara lost ten years ago.',1510,120,191],
  ['n08','The archive room','Inside the municipal archive, the lights wake one row at a time. A file already lies open on the desk.',1810,120,171],
  ['n09','The lighthouse file','The photographs show a lighthouse that has never existed on any map of the city.',2110,120,153],
  ['n10','The confession','Mara finally understands why her father never spoke about the winter of 1998.',2410,120,338],
  ['n11','The last train','There is one train left on the board. It has no destination, only a departure time.',2710,120,306],
  ['n12','Afterlight','When morning reaches the river, the city looks almost unchanged. Almost.',3010,120,46],
] as const;

export const sampleProject: Project = {
  id: 'afterlight',
  title: 'Afterlight',
  entryNodeId: 'n01',
  nodes: rawNodes.map(([id,title,text,x,y,ambientHue]) => ({id,title,text,position:{x,y},createdAt:now,updatedAt:now,ambientHue})),
  edges: [
    {id:'e01',from:'n01',to:'n02',type:'next'},
    {id:'e02',from:'n02',to:'n03',type:'next'},
    {id:'e03',from:'n03',to:'n04',type:'next'},
    {id:'e04a',from:'n04',to:'n05',type:'branch'},
    {id:'e04b',from:'n04',to:'n06',type:'branch'},
    {id:'e05',from:'n05',to:'n07',type:'next'},
    {id:'e06',from:'n06',to:'n07',type:'next'},
    {id:'e07',from:'n07',to:'n08',type:'next'},
    {id:'e08',from:'n08',to:'n09',type:'next'},
    {id:'e09',from:'n09',to:'n10',type:'next'},
    {id:'e10',from:'n10',to:'n11',type:'next'},
    {id:'e11',from:'n11',to:'n12',type:'next'},
  ],
};
