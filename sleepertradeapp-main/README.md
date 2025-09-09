# Sleeper Trade Assistant

A React + Vite application that helps analyze Sleeper fantasy football leagues and provides trade suggestions based on positional depth and FantasyPros rankings.

## Features

- Load Sleeper league data via API
- Upload FantasyPros CSV rankings for player valuations
- Analyze team positional depth vs league averages
- Generate trade suggestions based on surplus/need analysis
- Support for different league types (Dynasty/Redraft, Superflex, PPR settings)

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. Enter a Sleeper League ID in the input field
2. Click "Load League" to fetch league data
3. Optionally upload a FantasyPros CSV file for player rankings
4. Use the position filters to focus on specific positions
5. View trade suggestions based on team needs and surpluses

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Sleeper API** - Fantasy football data

## Project Structure

```
src/
├── components/
│   └── ui/
│       └── button.tsx    # Reusable button component
├── App.tsx               # Main application component
├── main.tsx             # Application entry point
└── index.css            # Global styles with Tailwind
```

## License

MIT
