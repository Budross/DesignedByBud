# DesignedByBud - MagCase Website

A modern, interactive website showcasing the MagCase product line - magnetic card cases and organizers for trading card collectors.

## About MagCase

MagCase by DesignedByBud offers premium magnetic card cases designed for collectors who want secure, stylish storage for their valuable trading cards. The product line features:

- **MagCase** - Modular magnetic card cases with interchangeable top and bottom pieces for customizable color combinations
- **Weighted-Base MagCase Organizer** - Premium display organizer with weighted base for stability
- **Weighted-Base 50-Card Organizer** - Heavy-duty organizer with capacity for up to 50 top-loader cards
- **MagCase Modular Stand** - Magnetic snap-together stand system for displaying MagCases

## Project Structure

```
demo/
├── index.html                      # Main landing page
├── shelf-builder.html              # Interactive shelf builder tool
├── blog.html                       # Blog page
├── landing-page.css                # Landing page styles
├── product-card.css                # Product card component styles
├── product-viewer.css              # 3D viewer styles
├── app.js                          # Main application logic
├── obj-viewer.js                   # 3D object viewer implementation
├── service-worker.js               # PWA service worker for caching
├── server.py                       # Python development server
├── server-start.bat                # Windows batch script to start server
├── CACHING.md                      # Caching strategy documentation
├── CNAME                           # Custom domain configuration
├── _headers                        # HTTP headers configuration
│
├── products/                       # 3D model files
│   ├── MagCase.obj
│   ├── MagCaseAssembled.obj
│   ├── MagCase Modular Stand.obj
│   ├── Weighted-Base MagCase Organizer.obj
│   └── Weighted-Base 50-Card Organizer.obj
│
├── graphics/                       # Image assets
│   ├── DBB_LOGO.webp
│   ├── DBB_LOGO.png
│   ├── WebsiteBanner.webp
│   └── EtsyBanner2.png
│
├── productPages/                   # Product page resources
│   ├── PRODUCT-PAGES-GUIDE.md
│   ├── 3d-button-styles.css
│   └── updated-product-info.html
│
└── product-*.html                  # Individual product detail pages
    ├── product-magcase.html
    ├── product-weighted-magcase.html
    ├── product-weighted-50card.html
    └── product-modular-stand.html
```

## Features

### Interactive 3D Product Viewers
- Real-time 3D product visualization using Three.js
- Drag-to-rotate functionality for all products
- Auto-rotate toggle option
- Reset view controls
- Optimized loading with progressive enhancement

### Responsive Design
- Mobile-first approach
- Optimized for all screen sizes
- Touch-friendly interactions
- Performance-focused layout

### SEO & Social Media Optimization
- Comprehensive meta tags for search engines
- Open Graph tags for social media sharing
- Twitter Card integration
- Structured data (Schema.org) for rich search results
- Canonical URLs

### Performance Optimizations
- Service worker for offline functionality and caching
- Deferred CSS loading for above-the-fold content
- Lazy-loaded 3D models
- WebP image format for smaller file sizes
- Version-controlled asset caching

### Customer Reviews Integration
- Direct integration with Etsy review data
- 5-star rating display
- Customer testimonials showcase

### Newsletter Subscription
- Formspree integration for email collection
- Responsive form design
- Privacy-focused implementation

## Technology Stack

- **HTML5** - Semantic markup with accessibility features
- **CSS3** - Modern styling with flexbox, grid, and custom properties
- **JavaScript (ES6+)** - Interactive functionality and 3D rendering
- **Three.js (r128)** - WebGL-based 3D model rendering
- **OBJLoader & MTLLoader** - 3D model loading utilities
- **Google Fonts** - Poppins and Inter font families
- **Formspree** - Newsletter form handling
- **Service Worker API** - PWA capabilities and caching

## Getting Started

### Prerequisites

- Python 3.x installed on your system
- Modern web browser with WebGL support

### Local Development

1. Clone or download the project to your local machine

2. Navigate to the project directory:
   ```bash
   cd demo
   ```

3. Start the development server:

   **On Windows:**
   ```bash
   server-start.bat
   ```

   **On Mac/Linux:**
   ```bash
   python3 server.py
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

### Deployment

The website is configured for deployment with:
- Custom domain support via `CNAME` file
- HTTP headers configuration in `_headers` file
- Service worker for production caching

## File Descriptions

### Core Files

- **index.html** - Main landing page with hero section, product grid, reviews, and newsletter signup
- **shelf-builder.html** - Interactive tool for visualizing MagCase shelf arrangements
- **app.js** - Core JavaScript functionality including 3D viewer initialization and UI interactions
- **obj-viewer.js** - Dedicated 3D model viewer implementation with Three.js
- **service-worker.js** - Handles asset caching and offline functionality

### Styling

- **landing-page.css** - Styles for the main landing page layout and components
- **product-card.css** - Reusable product card component styles
- **product-viewer.css** - Styles for the 3D viewer interface

### Configuration

- **CACHING.md** - Documentation of the caching strategy and implementation
- **_headers** - HTTP headers for security and performance optimization
- **CNAME** - Custom domain configuration for hosting

## Performance Features

### Service Worker Caching
The service worker implements a comprehensive caching strategy for:
- HTML pages
- CSS stylesheets
- JavaScript files
- 3D model files (.obj)
- Image assets

### Deferred CSS Loading
Non-critical CSS is loaded asynchronously after First Contentful Paint (FCP) to improve initial page load performance.

### Asset Versioning
Static assets use version query parameters (e.g., `?v=1.0.2`) to ensure proper cache invalidation during updates.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

WebGL support required for 3D model viewing.

## Links

- **Etsy Store**: [designedbybud.etsy.com](https://designedbybud.etsy.com)
- **Website**: [www.designedbybud.com](https://www.designedbybud.com)
- **TikTok**: [@designedbybud](https://www.tiktok.com/@designedbybud)
- **Instagram**: [@designedbybud](https://www.instagram.com/designedbybud/)
