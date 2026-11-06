// Sticky header: the site header stays at the top of the window and slims down once the
// page is scrolled. A spacer as tall as the full header holds its place in the page, so
// nothing below it moves when it changes size.
(function () {
  var header = document.querySelector('header');
  var spacer = document.querySelector('.header-spacer');
  if (!header || !spacer) return;
  var compact = false, ticking = false, resizeTimer;

  // The full header's height, measured with transitions off so the reading is final.
  function measure() {
    header.classList.add('no-anim');
    header.classList.remove('is-compact');
    spacer.style.height = header.offsetHeight + 'px';
    header.classList.toggle('is-compact', compact);
    void header.offsetHeight;          // apply the restored state before transitions return
    header.classList.remove('no-anim');
  }

  // Slim past 64 px of scroll; back to full size only near the very top, so it never flickers.
  function update() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset || 0;
    var next = compact ? y > 8 : y > 64;
    if (next !== compact) {
      compact = next;
      header.classList.toggle('is-compact', compact);
    }
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  });
  window.addEventListener('load', measure);   // the logo or fonts can change the height
  measure();
  update();
})();
