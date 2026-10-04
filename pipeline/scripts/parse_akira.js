const https = require('https');

https.get('https://akirabox.to/1RgzRaeb3bpB/file', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const nextData = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) {
      try {
        const json = JSON.parse(nextData[1]);
        console.log('Keys in pageProps:', Object.keys(json.props?.pageProps || {}));
        console.log('File details:', JSON.stringify(json.props?.pageProps?.file || json.props?.pageProps, null, 2).substring(0, 1000));
      } catch (e) {
        console.log('JSON parse err:', e.message);
      }
    } else {
      console.log('No NEXT_DATA');
      // look for any links or forms
      const forms = data.match(/<form[\s\S]*?<\/form>/gi);
      console.log('Forms:', forms);
    }
  });
}).on('error', err => console.log('Err:', err.message));
