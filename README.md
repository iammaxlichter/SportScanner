# SportScanner

SportScanner is a Microsoft Edge extension that displays live sports scores directly on your screen. It provides real-time updates across multiple leagues in a compact, draggable bar — without interrupting your browsing experience.

## Features

- **Live Scores:** Stay updated with ongoing games from major leagues (NFL, NBA, MLB, NCAAF, and more).  
- **Draggable Score Bar:** Move and dock the live score bar anywhere on the screen.  
- **Compact Design:** Minimal, non-intrusive interface that fits neatly at the bottom of the browser.  
- **Team Following:** Follow your favorite teams to prioritize their games.  
- **Persistent Settings:** Your preferences (teams, theme, position, etc.) are saved automatically.  
- **Themes:** Choose between light, dark, or auto themes matching your system.  
- **Badge Updates:** The Edge toolbar badge shows the total number of live games.  
- **Anchor Mode:** Optionally dock the bar vertically to the side of your screen.  

## How It Works

1. **Install the Extension:** Load the unpacked folder in Microsoft Edge (Developer Mode → Load unpacked).  
2. **Select Teams:** Use the Options page to follow teams and adjust settings.  
3. **View Scores:** Open any tab to see a floating bar displaying current live scores.  
4. **Customize:** Drag the bar, toggle theme, or collapse it when not in use.

## Tech Stack

- **Frontend:** React + TypeScript + Vite  
- **Extension Framework:** CRXJS Plugin (Manifest V3)  
- **API Proxy:** Cloudflare Worker (for secure and rate-limited score fetching)  
- **Storage:** Chrome Sync Storage (persistent settings across devices)  

<br><br>

## License

MIT License © 2025 Max Lichter
https://iammaxlichter.com