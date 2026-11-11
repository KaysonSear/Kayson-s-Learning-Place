import type { ButtonHTMLAttributes } from 'react';
import type { DrillQuestion, Point, Question } from './types.ts';

export function Button({className = 'secondary', type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={'button ' + className} {...props} />;
}

export function Prose({html, className = ''}: {html: string; className?: string}) {
  return <div className={('prose ' + className).trim()} dangerouslySetInnerHTML={{__html: html}} />;
}

export function Explanation({question, point}: {question: Question | DrillQuestion; point: Point | undefined}) {
  return question.sourceTable && point ? <Prose html={point.html} className="feedback-prose" /> : <p>{question.explanation}</p>;
}

export function focus(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
