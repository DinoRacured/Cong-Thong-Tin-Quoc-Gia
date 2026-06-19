const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
}

async function gotoWithRetry(page, url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await page.goto(url, options);
        } catch (error) {
            console.log(`Lần thử ${i + 1} thất bại khi truy cập ${url}: ${error.message}`);
            if (i === maxRetries - 1) throw error;
            console.log('Đang thử lại sau 5 giây...');
            await delay(5000);
        }
    }
}

/**
 * Hàm bóc tách dữ liệu chi tiết từ trang TTHC
 */
async function extractDetailedData(page) {
    return await page.evaluate(async () => {
        const data = {};
        const targetFields = [
            "Mã thủ tục", "Số quyết định", "Tên thủ tục", "Cấp thực hiện", "Loại thủ tục",
            "Lĩnh vực", "Trình tự thực hiện", "Cách thức thực hiện", "Thành phần hồ sơ",
            "Đối tượng thực hiện", "Cơ quan thực hiện", "Cơ quan có thẩm quyền",
            "Địa chỉ tiếp nhận HS", "Cơ quan được uỷ quyền", "Cơ quan phối hợp",
            "Kết quả thực hiện", "Căn cứ pháp lý", "Yêu cầu điều kiện thực hiện",
            "Từ khoá", "Mô tả"
        ];
        targetFields.forEach(f => data[f] = "");

        const tableToText = (table) => {
            if (!table) return '';
            const rows = Array.from(table.querySelectorAll('tr'));
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                return "'- " + cells.map(c => c.innerText.trim().replace(/\n/g, ' ')).join(' | ');
            }).join('\n');
        };

        const titleEl = document.querySelector('h3.text-lg.font-semibold');
        if (titleEl) data["Tên thủ tục"] = titleEl.innerText.trim();

        const gridRows = document.querySelectorAll('.flex.flex-col.md\\:flex-row.border-gray-300');
        gridRows.forEach(row => {
            const divs = row.children;
            if (divs.length >= 2) {
                const labelStr = divs[0].innerText.trim();
                const cleanLabel = labelStr.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
                const valStr = divs[1].innerText.trim();
                
                const matchedField = targetFields.find(f => {
                    const cleanF = f.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
                    return cleanF === cleanLabel || cleanLabel.includes(cleanF) || cleanF.includes(cleanLabel);
                });
                if (matchedField) data[matchedField] = valStr;
            }
        });

        const h4s = document.querySelectorAll('h4');
        h4s.forEach(h4 => {
            const labelStr = h4.innerText.trim();
            const cleanLabel = labelStr.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
            const matchedField = targetFields.find(f => {
                const cleanF = f.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ');
                return cleanLabel.includes(cleanF) || cleanF.includes(cleanLabel);
            });

            if (matchedField) {
                let contentEl = h4.nextElementSibling;
                if (contentEl) {
                    const table = contentEl.tagName === 'TABLE' ? contentEl : contentEl.querySelector('table');
                    if (table) {
                        data[matchedField] = tableToText(table);
                    } else {
                        data[matchedField] = contentEl.innerText.trim();
                    }
                }
            }
        });

        return data;
    });
}

(async () => {
    // --- BƯỚC 0: DỌN DẸP DỮ LIỆU CŨ ---
    const filesToCleanup = ['dichvucong_data.json', 'dichvucong_data_detailed.json'];
    filesToCleanup.forEach(f => {
        if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); console.log(`Đã xóa file cũ: ${f}`); } catch (e) { }
        }
    });

    // --- BƯỚC 1: ĐỌC DANH SÁCH URL ---
    let targetUrls = [];
    const csvPath = path.join(__dirname, 'crawl_tthc', 'danhsach.csv');

    if (fs.existsSync(csvPath)) {
        console.log(`Đang đọc danh sách URL từ: ${csvPath}`);
        const content = fs.readFileSync(csvPath, 'utf-8');
        targetUrls = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('http'));
        console.log(`Tổng cộng có ${targetUrls.length} URL cần xử lý.`);
    } else {
        console.log('Không tìm thấy file danhsach.csv.');
        process.exit(1);
    }

    console.log('Khởi động trình duyệt (Chế độ chạy ngầm)...');
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    let allData = []; // Toàn bộ dữ liệu (để lưu file local)
    let buffer = [];  // Bộ nhớ đệm để gửi n8n (30 mục)
    const total = targetUrls.length;
    const batchSizeForN8n = 30;

    async function sendBatch(dataToSend, currentCount, maxRetries = 3) {
        const batchNum = Math.ceil(currentCount / batchSizeForN8n);
        const totalBatches = Math.ceil(total / batchSizeForN8n);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`>>> Đang gửi đợt ${batchNum}/${totalBatches} (Lần thử ${attempt}) lên n8n...`);
                const response = await fetch('https://n8n.1022.vn/webhook/congthongtinquocgia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: "dvc_production_js",
                        total_all: total,
                        batch_info: `${batchNum}/${totalBatches}`,
                        data: dataToSend
                    }),
                    signal: AbortSignal.timeout(90000)
                });

                if (!response.ok) {
                    throw new Error(`Server trả về lỗi: ${response.status}`);
                }

                console.log(`>>> Gửi đợt ${batchNum} thành công. Nghỉ 30s...`);
                await delay(30000); // Nghỉ 30s giữa các lần gửi
                return; // Thoát hàm khi thành công
            } catch (e) {
                console.log(`>>> Lỗi gửi đợt ${batchNum} (Lần thử ${attempt}): ${e.message}`);
                if (attempt < maxRetries) {
                    console.log('Thử lại sau 10 giây...');
                    await delay(10000);
                } else {
                    console.log(`!!! Thất bại hoàn toàn đợt ${batchNum} sau ${maxRetries} lần thử.`);
                }
            }
        }
    }

    async function gitPush() {
        try {
            console.log('>>> Đang chuẩn bị đẩy toàn bộ dữ liệu lên GitHub...');

            // Thêm tùy chọn để ẩn cửa sổ cmd khi chạy nền trên Windows
            const execOpts = { windowsHide: true };

            // Kiểm tra xem thư mục đã được khởi tạo Git chưa
            try {
                execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore', ...execOpts });
            } catch (e) {
                execSync('git init', execOpts);
            }

            // Đảm bảo remote origin luôn sử dụng địa chỉ SSH để push không cần mật khẩu
            try {
                execSync('git remote set-url origin git@github.com:DinoRacured/Cong-Thong-Tin-Quoc-Gia.git', execOpts);
            } catch (e) {
                execSync('git remote add origin git@github.com:DinoRacured/Cong-Thong-Tin-Quoc-Gia.git', execOpts);
            }

            // Chỉ thêm các tệp mã nguồn và JSON, loại trừ các tệp .csv và thư mục node_modules
            execSync('git add . ":(exclude)*.csv" ":(exclude)node_modules/"', execOpts);
            const status = execSync('git status --porcelain', execOpts).toString();
            if (status) {
                const commitMsg = `Cập nhật dữ liệu tự động: ${new Date().toLocaleString('vi-VN')}`;
                execSync(`git commit -m "${commitMsg}"`, execOpts);
                execSync('git branch -M main', execOpts);

                // Đồng bộ dữ liệu từ server về trước khi đẩy lên để tránh lỗi conflict
                try {
                    console.log('Đang kiểm tra và đồng bộ với GitHub...');
                    execSync('git pull --rebase origin main', execOpts);
                } catch (e) {
                    // Bỏ qua nếu repository mới khởi tạo chưa có nhánh main
                }

                execSync('git push -u origin main', execOpts);
                console.log('>>> Đẩy lên GitHub thành công!');
            } else {
                console.log('>>> Không có thay đổi mới để push.');
            }
        } catch (error) {
            console.log(`>>> Lỗi Git: ${error.message}`);
        }
    }

    for (let i = 0; i < total; i++) {
        const url = targetUrls[i];
        console.log(`[${i + 1}/${total}] Đang xử lý: ${url}`);

        try {
            await gotoWithRetry(page, url, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(2000);

            const detailData = await extractDetailedData(page);
            detailData.url = url;

            allData.push(detailData);
            buffer.push(detailData);

            // Cứ 30 mục thì gửi n8n một lần
            if (buffer.length === batchSizeForN8n) {
                await sendBatch(buffer, i + 1);
                buffer = []; // Reset buffer sau khi gửi
                // Lưu file local dự phòng
                fs.writeFileSync('dichvucong_data_production.json', JSON.stringify(allData, null, 2), 'utf-8');
                await gitPush(); // Tự động đẩy lên GitHub sau mỗi 30 mục
            }

        } catch (e) {
            console.log(`Lỗi tại URL ${url}: ${e.message}`);
        }
    }

    // Gửi nốt những mục còn lại trong buffer (nếu có)
    if (buffer.length > 0) {
        await sendBatch(buffer, total);
    }

    console.log('HOÀN THÀNH TOÀN BỘ DANH SÁCH!');
    fs.writeFileSync('dichvucong_data_production.json', JSON.stringify(allData, null, 2), 'utf-8');
    await gitPush();
    await browser.close();
})();
