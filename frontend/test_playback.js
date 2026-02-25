const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    console.log('Page loaded');

    // Click GET STARTED if tracking modal is there
    // Actually on 'landing' view we just need to click the big button
    try {
        const getStartedBtn = await page.$('button');
        if (getStartedBtn) {
            await getStartedBtn.click();
            console.log('Clicked GET STARTED');
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (e) {
        console.log('Could not click get started', e);
    }

    // Now in home view. Click 'happy' mood.
    try {
        const happyBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => b.textContent && b.textContent.includes('HAPPY'));
        });
        if (happyBtn) {
            await happyBtn.click();
            console.log('Clicked HAPPY mood');
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (e) {
        console.log('Could not click happy mood', e);
    }

    // Click the first song Let's find a button with 'Happy' title
    try {
        const songBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => b.textContent && b.textContent.includes('Pharrell Williams'));
        });
        if (songBtn) {
            await songBtn.click();
            console.log('Clicked song');
            await new Promise(r => setTimeout(r, 5000));
        }
    } catch (e) {
        console.log('Could not click song', e);
    }

    console.log('Done testing.');
    await browser.close();
})();
