/** Shakes an element in place, without remounting it (so inputs keep focus). */
export function shake(el: Element | null | undefined) {
  el?.animate(
    [0, -2, 4, -7, 7, -7, 7, -7, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 450, easing: 'ease-out' },
  );
}
