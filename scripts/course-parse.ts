import type { Chapter, Cluster, Point, SourceSection } from '../src/types.ts';

export interface ParsedCourse {
  chapters: Chapter[];
  clusters: Cluster[];
  points: Point[];
  extras: SourceSection[];
}

interface Heading {
  level: number;
  title: string;
  start: number;
  end: number;
}

/** Split the course Markdown by its `##` / `###` / `####` headings, ignoring fenced blocks. */
export function parseCourse(raw: string): ParsedCourse {
  const headings: Heading[] = [];
  let offset = 0;
  let fenced = false;
  for (const line of raw.split(/(?<=\n)/)) {
    if (/^```/.test(line)) fenced = !fenced;
    const match = !fenced && /^(#{2,4}) (.+?)\r?\n?$/.exec(line);
    if (match) headings.push({level: match[1].length, title: match[2], start: offset, end: offset + line.length});
    offset += line.length;
  }

  const chapters: Chapter[] = [];
  const clusters: Cluster[] = [];
  const points: Point[] = [];
  const extras: SourceSection[] = [];
  let chapter = 0;
  let cluster = '';

  extras.push({
    html: '',
    title: '阅读约定',
    markdown: raw.slice(0, headings[0]?.start ?? raw.length).replace(/^---[\s\S]*?---\s*/, '').replace(/^# Coding · C\s*/, '').trim()
  });

  headings.forEach((heading, index) => {
    const markdown = raw.slice(heading.end, headings[index + 1]?.start ?? raw.length).trim();
    if (heading.level === 2 && /^\d{2} /.test(heading.title)) {
      chapter = Number(heading.title.slice(0, 2));
      if (chapter) chapters.push({id: chapter, title: heading.title, markdown, html: '', pointIds: [], labId: ''});
    } else if (heading.level === 3 && /^(\d{2}\.\d+) /.test(heading.title)) {
      cluster = heading.title.match(/^[\d.]+/)![0];
      clusters.push({id: cluster, chapter, title: heading.title, markdown, html: ''});
    } else if (heading.level === 4 && /^\d+\. /.test(heading.title)) {
      points.push({
        id: Number(heading.title.match(/^\d+/)![0]),
        title: heading.title.replace(/^\d+\. /, ''),
        chapter,
        cluster,
        markdown,
        html: '',
        search: ''
      });
    } else if (heading.level === 2 || !/^\d/.test(heading.title)) {
      extras.push({html: '', title: heading.title, markdown});
    }
  });

  return {chapters, clusters, points, extras};
}
