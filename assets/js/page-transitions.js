// Smooth page transitions

// Back/Forward can restore a page from the browser's back-forward cache
// exactly as it was left: faded out by the link handler below, which shows
// as a blank page. Fade it back in whenever the page is shown.
window.addEventListener('pageshow', function() {
  document.body.classList.remove('fade-out');
  document.body.classList.add('fade-in');
});

document.addEventListener('DOMContentLoaded', function() {
  const body = document.body;
  const mainContent = document.querySelector('.page-content') || document.querySelector('main') || body;
  
  // Add fade-in class on page load
  body.classList.add('fade-in');
  
  // Make all external links open in new tab
  document.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href');
    
    // Skip if no href
    if (!href) {
      return;
    }
    
    // Check if it's an external link
    const isExternal = (href.startsWith('http://') || href.startsWith('https://')) && 
                       !href.includes(window.location.hostname);
    
    // Open external links in new tab
    if (isExternal || href.startsWith('mailto:')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
  
  // Intercept all internal links for transitions
  document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Skip if no href
      if (!href) {
        return;
      }
      
      // Skip if it's an anchor link on the same page
      if (href.startsWith('#')) {
        return;
      }
      
      // Skip if it's mailto
      if (href.startsWith('mailto:')) {
        return;
      }
      
      // Skip if it opens in a new tab/window
      if (this.hasAttribute('target')) {
        return;
      }
      
      // Skip external links (links with http:// or https:// that aren't on this domain)
      if (href.startsWith('http://') || href.startsWith('https://')) {
        if (!href.includes(window.location.hostname)) {
          return;
        }
      }
      
      // This is an internal link, apply transition
      e.preventDefault();
      
      // Fade out
      body.classList.remove('fade-in');
      body.classList.add('fade-out');
      
      // Navigate after fade completes
      setTimeout(() => {
        window.location.href = href;
      }, 300); // Match this with CSS transition duration
    });
  });
});
