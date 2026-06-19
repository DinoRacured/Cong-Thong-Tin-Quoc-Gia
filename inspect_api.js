const puppeteer = require('puppeteer');

async function test() {
    console.log("Khởi động trình duyệt...");
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    page.on('response', async response => {
        if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
            try {
                const contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    const url = response.url();
                    if (url.includes('list-all-public-formality-by-citizen')) {
                        const data = await response.json();
                        console.log('\n--- API JSON: list-all-public-formality-by-citizen ---');
                        console.log('Payload gửi lên:', response.request().postData());
                        console.log('Tổng số mục (total):', data.data.total);
                        console.log('Số mục trả về (items):', data.data.items?.length);
                    }
                }
            } catch (e) {
                // Ignore
            }
        }
    });

    console.log("Đang truy cập trang tìm kiếm...");
    await page.goto('https://dichvucong.gov.vn/tra-cuu-thu-tuc/danh-sach?showAdvanced=true&searchType=PROVINCE&formalityType=STANDARD&province=H17&implementingLevel=PROVINCE&limit=10&activeKey=STANDARD', { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log("Chờ 5 giây...");
    await new Promise(r => setTimeout(r, 5000));
    
    await browser.close();
    console.log("Hoàn tất.");
}

test().catch(console.error);
