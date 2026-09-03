# Liquid Glass Labs

i need a landing page for my github pages can you update my github page to look more high quality with better ui/ux matching apple quality, in my app's same ui language, it should have liquid glass buttons with high refraction and low frost or blur (for buttons and should). it should be minimalistic at the same time providing clear instructions, light and dark mode only if possible, and ready to copy command lines for the different builds. it should look high end and professional as if its an apple website. minimal with clear info.

taking information from my readme file

We are building a premium, bespoke web application. The absolute highest priority is avoiding the generic "AI vibe-coded" SaaS template. Do not use glowing background gradients, pill-shaped badges, standard 3-column feature grids, or the Inter font. 

## Visual Style & Design (Liquid Glass)

- **liquid glass Constraints**: No global `opacity` on containers. Use semi-transparent backgrounds (e.g., `bg-white/10`) with deep blurs and saturation (`backdrop-blur-2xl backdrop-saturate-150`).

- **Specular Highlights & Depth**: All glass components must have a subtle 1px top-edge highlight (e.g., `border-t border-white/20`) and layered inner/outer shadows. No flat `shadow-xl`.

- **Typography & Color**: Strictly ban Inter, Arial, and Roboto. Use a geometric sans for UI elements and an editorial serif for data. Ban pure black (#000000). Use tinted deep neutrals (e.g., #0A0A0C).

- **Layout & Radii**: Use mathematical nesting for all components (Inner Radius = Outer Radius - Padding). Favor asymmetry and negative space over symmetrical 3-card grids.

## Technical Requirements

- **Motion**: Keep hover states and transitions fast and physical (`transform` and `opacity` only). No slow, generic fade-in-on-scroll loops.

- **Desktop UX**: Use `scrollbar-hide` for a native app feel and `overscroll-none` on the main wrapper to prevent elastic scrolling.

- **Data & Truncation**: Use hyper-realistic, asymmetric mock data of varying lengths (never "Lorem Ipsum"). Implement strict `truncate` and `line-clamp` rules so the UI doesn't break.

## Safe-Guard Instructions

- Do NOT generate messy inline Tailwind utility soup for complex UI. Abstract glass styles into reusable React components.

- Use a premium icon set with a strictly uniform stroke width (exactly 1.5px) across the entire application.

Primary Objective**: Serve as the official download and landing page for "Stremio Plus", a high-performance desktop media client.

- **Hero Section CTA**: Prominent, highly tactile primary action buttons for downloading the latest native builds (macOS `.dmg`, Windows `.exe`, Linux `.AppImage`) linking directly to `https://github.com/nate86-cloud/nate86-cloud/releases/latest`.

- **Showcase Area**: A central, high-fidelity visual preview component highlighting the app's Liquid Glass UI, minimal dark aesthetic, and streaming interface.

- **Feature Highlights**: Asymmetric bento-grid or floating layout detailing cross-platform support, real-time Sentry stability, and custom add-on flexibility.

I uploaded my icon and readme.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20c16ad1-4a7e-4107-8a49-2f459be68bba).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
