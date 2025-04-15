# URL Blocker Chrome Extension

A powerful Chrome extension that allows you to selectively block specific URLs, resources, and ad elements from loading on web pages.

## Features

- **URL Blocking**: Manually enter URLs to block across all websites
- **Element Selector Tool**: Click on any element (like ads) to identify and block its source URL
- **DevTools Integration**: Track blocked requests and manage URLs from Chrome DevTools
- **Context Menu Support**: Right-click on elements to activate the selector
- **Request Logging**: View a log of all blocked requests
- **User-Friendly Interface**: Easy-to-use popup and DevTools panel

## Installation

### From Chrome Web Store

_(Coming soon)_

### Manual Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The URL Blocker extension is now installed and ready to use

## How to Use

### Blocking URLs Manually

1. Click the URL Blocker icon in your Chrome toolbar
2. Enter the URL you want to block (e.g., `example.com`, `ads.example.com/banner`)
3. Click "Block URL"
4. The URL will be added to your block list and immediately start blocking

### Using the Element Selector Tool

1. Navigate to a page with ads or elements you want to block
2. Click the URL Blocker icon in your toolbar
3. Click "Select Element to Block"
4. Your cursor will change to a crosshair
5. Hover over elements to highlight them
6. Click on the ad or element you want to block
7. A dialog will show you URLs associated with that element
8. Select the URL you want to block
9. The selected URL will be added to your block list

### Using the Context Menu

1. Right-click on an ad or element you want to block
2. Select "Block ad element" from the context menu
3. Follow steps 4-8 from the element selector instructions above

### Using the DevTools Panel

1. Open Chrome DevTools (F12 or Ctrl+Shift+I)
2. Click on the "URL Blocker" tab
3. Here you can:
   - View and manage blocked URLs
   - See a log of all blocked requests
   - Use the element selector tool
   - Clear logs and manage settings

## Limitations

- The extension cannot block URLs from being loaded by scripts that dynamically inject content after the page has loaded
- Some websites may use obfuscated or dynamically generated URLs that change frequently
- Extremely complex ad delivery systems might require multiple URLs to be blocked

## Privacy

This extension:

- Works locally within your browser
- Does not collect any data
- Does not send any information to external servers
- Only blocks the URLs you specify

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Icon design by [YOUR NAME]
- Inspired by the need for more granular control over web content
