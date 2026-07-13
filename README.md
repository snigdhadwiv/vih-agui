# vih-agui (Agentic UI Plugin)

A drop-in, zero-dependency, ultra-lightweight Web Component that adds an AI-powered conversational analytics interface to **any** web application. Designed for maximum performance, maximum compatibility, and a premium "Glassmorphism" aesthetic.

## 🚀 Features

*   **Zero Dependencies**: Built entirely with Vanilla JavaScript (ES6+), native Web Components, and raw CSS/SVG. No React, no Tailwind, no Framer Motion. 
*   **Universal Compatibility**: Drops into React (including older Webpack 4 setups), Vue, Angular, Next.js, or plain HTML without a single transpilation error or bundle conflict.
*   **Tiny Footprint**: Weighs in at ~15kb. Zero bloat.
*   **Premium Glassmorphism UI**: High-end visuals using `backdrop-filter`, silky smooth CSS `@keyframes`, and a sleek modern monochrome color palette.
*   **Context-Aware Scraping**: Automatically scans the host page (your dashboard) for semantic context, text, charts, and tables to provide accurate answers based on *what the user is currently looking at*.
*   **Inline Chart Generation**: Capable of rendering 40+ types of data visualizations (bar charts, line charts, heatmaps, radar charts, etc.) using pure, math-driven SVGs generated on the fly.
*   **Self-Hosted GLM Support**: Connects to your own self-hosted Large Language Model (GLM) via a secure Node.js backend.

## 🛠️ Tech Stack

*   **Core**: Vanilla JavaScript (ES6+).
*   **Component Model**: Native HTML Web Components (`HTMLElement` + Shadow DOM).
*   **Styling**: Raw CSS injected into the Shadow DOM (Flexbox, CSS Grid, Glassmorphism).
*   **Animations**: Hardware-accelerated CSS `@keyframes` and `cubic-bezier` timing functions.
*   **Visualizations**: Pure math and native `<svg>` generation.
*   **Build Tools**: None. The raw source is exported directly.

## 📦 Installation

Install the package via NPM:

```bash
npm install vih-agui
```

## 💻 Frontend Integration

Integrating the plugin takes only two steps.

### For modern frameworks (React, Vue, Next.js, Vite, Webpack):

1. **Import the library** in your main entry file (e.g., `App.js`, `index.js`, or `main.js`):
   ```javascript
   import 'vih-agui';
   ```

2. **Inject the Web Component** anywhere in your application layout:
   ```html
   <agentic-ui-agent endpoint="http://localhost:4411"></agentic-ui-agent>
   ```

### For plain HTML:

If you are not using a build system, simply load the script as a module and use the tag:

```html
<body>
  <!-- Your dashboard content -->

  <!-- Inject the widget -->
  <agentic-ui-agent endpoint="http://localhost:4411"></agentic-ui-agent>

  <!-- Load the script -->
  <script type="module" src="node_modules/vih-agui/src/widget/agentic-widget.js"></script>
</body>
```

## 🧠 Backend Setup (Self-Hosted GLM)

The frontend widget requires a lightweight backend server to securely route requests to your self-hosted GLM model (preventing CORS issues and keeping credentials secure).

1. Copy the `server/server.js` file to your backend environment.
2. Install the necessary server dependencies:
   ```bash
   npm install express cors body-parser dotenv
   ```
3. Create a `.env` file and configure your GLM endpoint:
   ```env
   GLM_API_URL=http://your-self-hosted-glm-endpoint:port/api/generate
   PORT=4411
   ```
4. Start the server:
   ```bash
   node server.js
   ```

## 🎨 Supported Visualizations

The AI can generate the following pure-SVG charts on the fly based on your data:
*   Bar Charts (Horizontal, Stacked, Grouped, 100% Stacked)
*   Line & Area Charts (Spline, Step, Multi-Axis, Stacked, Range Area, Streamgraph)
*   Circular Charts (Half Donut, Polar Area, Radial Bar)
*   Hierarchical (Tree Map, Funnel, Pyramid)
*   Statistical & Financial (Bubble, Box Plot, Candlestick, Waterfall, Range Bar, Dot Plot, Dumbbell Plot, Parallel Coordinates)
*   KPI & Status (Stat with Sparkline/Sparkbar, Progress Bar/Ring, Linear Gauge, Bullet Chart, Status Indicator)
*   Grids & Heatmaps (Matrix Table, Heatmap, Calendar Heatmap, Comparison Board)
*   Miscellaneous (Word Cloud, Timeline Events, Radar Chart, Pictograph, Network Graph)
