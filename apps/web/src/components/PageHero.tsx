import type { ReactNode } from 'react';
import { IMAGES } from '../data/images';
import { PAGE_FRAME } from '../lib/layout';
import { Picture } from './Picture';

/**
 * The top of a section page: its title on canopy green beside a real photo from Uganda.
 * It breaks out of the page container to run edge to edge (Layout clips sideways overflow).
 */
export const PageHero = ({ title, intro, photo, focus = 'object-center', children }: {
  title: ReactNode;
  intro?: ReactNode;
  photo: keyof typeof IMAGES;
  focus?: string;
  children?: ReactNode;
}) => {
  const img = IMAGES[photo];
  return (
    <section className="on-dark relative isolate -mt-6 mx-[calc(50%-50vw)] overflow-hidden bg-canopy md:-mt-8">
      <div className="absolute inset-0 -z-10 md:left-auto md:w-[55%]">
        {img && <Picture src={img.src} alt="" width={960} height={640} sizes="(min-width: 768px) 55vw, 100vw" priority className={`size-full object-cover ${focus}`} />}
        <div aria-hidden className="absolute inset-0 bg-canopy/80 md:bg-transparent md:bg-gradient-to-r md:from-canopy md:via-canopy/40 md:to-transparent" />
      </div>
      <div className={`${PAGE_FRAME} py-10 md:py-14`}>
        <div className="flex flex-col gap-3 md:w-1/2">
          <h1 className="text-h1 text-paper">{title}</h1>
          <span aria-hidden className="block h-1 w-12 rounded-full bg-murram-light" />
          {intro && <p className="max-w-xl text-lg text-mist/90">{intro}</p>}
          {children}
        </div>
      </div>
    </section>
  );
};
