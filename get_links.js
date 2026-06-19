const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function getLinks() {
    const urlsToCrawl = [
        "https://dichvucong.gov.vn/tra-cuu-thu-tuc/danh-sach?showAdvanced=true&searchType=PROVINCE&formalityType=STANDARD&province=H17&implementingLevel=PROVINCE&limit=10&activeKey=STANDARD",
        "https://dichvucong.gov.vn/tra-cuu-thu-tuc/danh-sach?showAdvanced=true&searchType=PROVINCE&formalityType=STANDARD&province=H17&implementingLevel=COMMUNE&limit=10&activeKey=STANDARD"
    ];

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    let allLinks = ["url"]; // Dòng tiêu đề CSV

    for (let url of urlsToCrawl) {
        console.log("Đang truy cập trang chủ để lấy Session:", url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));
        
        const urlObj = new URL(url);
        const departmentCode = urlObj.searchParams.get('province') || "H17";
        const level = urlObj.searchParams.get('implementingLevel') || "PROVINCE";
        
        console.log(`Đang chạy API nội bộ quét toàn bộ link (level: ${level})...`);
        const result = await page.evaluate(async (dept, lvl) => {
            let items = [];
            let lastId = "";
            let hasMore = true;
            
            while (hasMore) {
                const res = await fetch('/api/v1/submitting/formality/list-all-public-formality-by-citizen', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        "limit": 100,
                        "lastId": lastId,
                        "q": "",
                        "categoryId": "",
                        "departmentCode": dept,
                        "type": "PROVINCE",
                        "level": lvl,
                        "formalityType": "STANDARD"
                    })
                });
                
                const data = await res.json();
                const newItems = data?.data?.items || [];
                if (newItems.length === 0) {
                    hasMore = false;
                } else {
                    items = items.concat(newItems);
                    lastId = data.data.lastId;
                    if (!lastId) hasMore = false;
                }
            }
            return items.map(item => `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}`);
        }, departmentCode, level);
        
        console.log(`-> Tìm thấy ${result.length} link thủ tục.`);
        allLinks = allLinks.concat(result);
    }

    await browser.close();

    const uniqueLinks = [...new Set(allLinks)];
    const csvPath = path.join(__dirname, 'crawl_tthc', 'danhsach.csv');
    fs.writeFileSync(csvPath, uniqueLinks.join('\n'), 'utf-8');
    
    console.log(`\nHoàn tất! Đã cập nhật ${uniqueLinks.length - 1} link vào file danhsach.csv`);
}

getLinks().catch(console.error);
