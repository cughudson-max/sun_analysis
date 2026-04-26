export type ColorStop = { offset: number; color: string };

export function getGradientCss(stops: ColorStop[], angle = '90deg'): string {
  const stopsStr = stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ');
  return `linear-gradient(${angle}, ${stopsStr})`;
}
export const viewport_gradients:Record<string,ColorStop[]> = {
  sketchup_blue:[
    { offset: 0.0, color: '#59d0ff' },
    { offset: 1.0, color: '#ffffff' }
  ],
  white: [
    { offset: 0.0, color: '#FFFFFF' },
    { offset: 1.0, color: '#FFFFFF' }
  ],
  black: [
    { offset: 0.0, color: '#000000' },
    { offset: 1.0, color: '#000000' }
  ],
  gray: [
    { offset: 0.0, color: '#CCCCCC' },
    { offset: 1.0, color: '#CCCCCC' }
  ],
  sketchup:[
    { offset: 0.0, color: '#e0e0e0' },
    { offset: 1.0, color: '#ffffff' }
  ]
};
export const gradients: Record<string, ColorStop[]> = {
  afmhot: [
    { offset: 0.0, color: '#000000' },
    { offset: 0.2, color: '#000080' },
    { offset: 0.4, color: '#008080' },
    { offset: 0.6, color: '#FFFF00' },
    { offset: 0.8, color: '#FF0000' },
    { offset: 1.0, color: '#FFFFFF' }
  ],
  CMRmap: [
    { offset: 0.0, color: '#000000' },
    { offset: 0.2, color: '#800080' },
    { offset: 0.4, color: '#FF0000' },
    { offset: 0.6, color: '#FFFF00' },
    { offset: 0.8, color: '#FFFFFF' },
    { offset: 1.0, color: '#FFFFFF' }
  ],
  rainbow: [
    { offset: 0.0, color: '#0000FF' },
    { offset: 0.25, color: '#00FFFF' },
    { offset: 0.5, color: '#00FF00' },
    { offset: 0.75, color: '#FFFF00' },
    { offset: 1.0, color: '#FF0000' }
  ],
  terrain: [
    { offset: 0.0, color: '#333399' },
    { offset: 0.25, color: '#00CC00' },
    { offset: 0.5, color: '#8B4513' },
    { offset: 0.75, color: '#CCCCCC' },
    { offset: 1.0, color: '#FFFFFF' }
  ],
  turbo: [
    { offset: 0.0, color: '#30123b' },
    { offset: 0.1, color: '#4145ab' },
    { offset: 0.2, color: '#4675ed' },
    { offset: 0.3, color: '#39a2fc' },
    { offset: 0.4, color: '#1bcfd4' },
    { offset: 0.5, color: '#24f89c' },
    { offset: 0.6, color: '#60f760' },
    { offset: 0.7, color: '#a4fc3b' },
    { offset: 0.8, color: '#d1e834' },
    { offset: 0.9, color: '#f3c65f' },
    { offset: 1.0, color: '#7a0403' }
  ],
  gist_rainbow: [
    { offset: 0.0, color: '#FF0000' },
    { offset: 0.16, color: '#FFFF00' },
    { offset: 0.33, color: '#00FF00' },
    { offset: 0.5, color: '#00FFFF' },
    { offset: 0.66, color: '#0000FF' },
    { offset: 0.83, color: '#FF00FF' },
    { offset: 1.0, color: '#FF0000' }
  ]
};
