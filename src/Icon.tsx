const paths: Record<string, string> = {
  logo: 'M3 12h3l3-7 4 14 3-7h5',
  plus: 'M12 5v14M5 12h14', play: 'm9 5 11 7-11 7Z', pause: 'M9 5v14m6-14v14',
  first: 'M5 6v12m14-12-9 6 9 6Z', last: 'M19 6v12M5 6l9 6-9 6Z',
  text: 'M4 6h16m-8 0v12m-4 0h8', rectangle: 'M5 5h14v14H5Z',
  ellipse: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z',
  chevron: 'm9 6 6 6-6 6', down: 'm6 9 6 6 6-6', trash: 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13m-7 4v5m4-5v5',
  clock: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0ZM12 7v5l3 2',
  spark: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z',
  fadeIn: 'M4 18V15m5 3v-6m6 6V9m5 9V5', fadeOut: 'M4 18V5m5 13V9m6 9v-6m5 6v-3',
  slideIn: 'M4 12h13m-5-5 5 5-5 5m7-12v14', slideOut: 'M5 5v14m2-7h13m-5-5 5 5-5 5',
  grow: 'M13 5h6v6M5 13v6h6M19 5l-5 5m-9 9 5-5',
  shrink: 'M20 4l-7 7m0-6v6h6M4 20l7-7m-6 0h6v6',
  rotate: 'M4 11a8 8 0 1 1 3 7M4 5v6h6',
  bounce: 'M3 17q4-16 9 0 4-10 9 0M3 21h18',
  shake: 'm3 12 4-5 5 10 5-10 4 5',
  color: 'M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z',
  panel: 'M3 5h18v14H3Zm0 9h18m-11 0v5',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}
