import pandas as pd
import requests
from bs4 import BeautifulSoup
import time
import random
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# Step 1: Load the CSV file and extract URLs
def load_urls_from_csv(file_path):
    try:
        df = pd.read_csv(file_path)
        print(f"Loaded CSV file with {len(df)} rows")
        urls = df['url'].tolist()
        return urls, df.columns.tolist()
    except Exception as e:
        print(f"Error loading CSV file: {e}")
        return None, None

# Step 2: Scrape data from URLs
def scrape_data(url):
    try:
        # Add a random delay to prevent being blocked
        time.sleep(random.uniform(1, 3))


        # Sử dụng Selenium để lấy HTML đã render (có thể lấy được nội dung động)
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--disable-gpu')
        driver = webdriver.Chrome(options=options)
        driver.get(url)
        time.sleep(3)  # Đợi trang và JS load xong

        # Click vào các tiêu đề để mở nội dung ẩn
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        for label in ["Cơ quan thực hiện", "Yêu cầu, điều kiện"]:
            try:
                elem = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, f'//*[contains(text(),"{label}")]'))
                )
                elem.click()
                time.sleep(1)
            except Exception as e:
                print(f"Không click được {label}: {e}")

        html = driver.page_source
        driver.quit()
        soup = BeautifulSoup(html, 'html.parser')
        data = {}
        # 1. Tên thủ tục
        main_title = soup.find(class_='main-title')
        data['Tên thủ tục'] = main_title.get_text(strip=True) if main_title else ''

        # 2. Cách thức thực hiện (join columns per row, leading quote before bullet)
        method_table = None
        method_heading = soup.find('h2', string=lambda s: s and 'Cách thức thực hiện' in s)
        if method_heading:
            method_table = method_heading.find_next('table')
        method_lines = []
        if method_table:
            for row in method_table.find_all('tr'):
                cells = row.find_all('td')
                if cells:
                    line = ' | '.join(cell.get_text(strip=True) for cell in cells)
                    method_lines.append(f"'- {line}")
        data['Cách thức thực hiện'] = '\n'.join(method_lines)

        # 3. Thành phần hồ sơ (join columns per row, skip 'Mẫu đơn, tờ khai', leading quote before bullet)
        profile_table = None
        profile_heading = soup.find('h2', string=lambda s: s and 'Thành phần hồ sơ' in s)
        if profile_heading:
            list_expand = profile_heading.find_next('div', class_='list-expand')
            if list_expand:
                profile_table = list_expand.find('table')
        profile_lines = []
        if profile_table:
            headers = [th.get_text(strip=True) for th in profile_table.find_all('th')]
            skip_idx = [i for i, h in enumerate(headers) if 'Mẫu đơn' in h or 'tờ khai' in h]
            for row in profile_table.find_all('tr'):
                cells = row.find_all('td')
                if cells:
                    filtered_cells = [cell.get_text(strip=True) for i, cell in enumerate(cells) if i not in skip_idx]
                    line = ' | '.join(filtered_cells)
                    profile_lines.append(f"'- {line}")
        data['Thành phần hồ sơ'] = '\n'.join(profile_lines)

        # 4. Cơ quan thực hiện, 5. Yêu cầu, điều kiện: lấy từ list-expand nếu có, nếu không thì lấy div liền kề sau h2 (dùng find_next để tránh lỗi node xen giữa)
        data['Cơ quan thực hiện'] = ''
        data['Yêu cầu, điều kiện'] = ''
        found_coquan = False
        found_yeucau = False
        # Có thể có nhiều div.list-expand, duyệt tất cả
        for list_expand in soup.find_all('div', class_='list-expand'):
            for item in list_expand.find_all('div', class_='item'):
                title = item.find('div', class_='title')
                content = item.find('div', class_='content')
                if title and content:
                    title_text = title.get_text(strip=True)
                    # Ưu tiên lấy nội dung từ div.article nếu có
                    article = content.find('div', class_='article')
                    if article:
                        content_text = article.get_text(separator='\n', strip=True)
                    else:
                        content_text = content.get_text(separator='\n', strip=True)
                    if not found_coquan and 'Cơ quan thực hiện' in title_text:
                        data['Cơ quan thực hiện'] = content_text
                        found_coquan = True
                    elif not found_yeucau and ('Yêu cầu' in title_text or 'điều kiện' in title_text):
                        data['Yêu cầu, điều kiện'] = content_text
                        found_yeucau = True
            if found_coquan and found_yeucau:
                break
       
        # 6. Trình tự thực hiện: ưu tiên lấy từ class 'ttth' nếu có
        data['Trình tự thực hiện'] = ''
        for h2 in soup.find_all('h2'):
            h2_text = h2.get_text(strip=True)
            if 'Trình tự thực hiện' in h2_text:
                next_div = h2.find_next(lambda tag: tag.name == 'div' and 'cls-impl-orders' in (tag.get('class') or []))
                if next_div:
                    ttth_nested = next_div.find('div', class_='ttth')
                    if ttth_nested:
                        data['Trình tự thực hiện'] = ttth_nested.get_text(separator='\n', strip=True)
                    else:
                        data['Trình tự thực hiện'] = next_div.get_text(separator='\n', strip=True)
                    break

        # 7. url
        data['url'] = url
        return data
    
    except Exception as e:
        print(f"Error scraping URL {url}: {e}")
        return {'url': url}

# Step 3 & 4: Process URLs incrementally and save to CSV/Excel
def process_urls_incrementally(csv_file, output_file, batch_size=10):
    urls, original_columns = load_urls_from_csv(csv_file)
    if not urls:
        return
    
    # Fields to extract (new order)
    fields = [
        'Tên thủ tục',
        'Cách thức thực hiện',
        'Thành phần hồ sơ',
        'Cơ quan thực hiện',
        'Yêu cầu, điều kiện',
        'Trình tự thực hiện',
        'url',
        'Mã TTHC',
        'Đối tượng',
        'Lĩnh vực'
    ]
    all_columns = fields
    
    # Create/prepare output file
    temp_csv = output_file.replace('.xlsx', '_temp.csv')
    file_exists = os.path.exists(temp_csv)
    
    total_urls = len(urls)
    batch_data = []
    
    for i, url in enumerate(urls):
        if pd.isna(url):
            print(f"Skipping empty URL {i+1}/{total_urls}")
            continue
        print(f"Processing URL {i+1}/{total_urls}: {url}")
        data = scrape_data(url)
        batch_data.append(data)
        # Write batch to CSV if batch size reached or last item
        if len(batch_data) >= batch_size or i == total_urls - 1:
            batch_df = pd.DataFrame(batch_data)
            # Merge with DanhSachTTHC.csv for Mã TTHC, Đối tượng, Lĩnh vực
            try:
                tthc_df = pd.read_csv('DanhSachTTHC.csv', delimiter=';')
                for idx, row in batch_df.iterrows():
                    match = tthc_df[tthc_df['tenTTHC'].str.strip() == row['Tên thủ tục'].strip()]
                    if not match.empty:
                        batch_df.at[idx, 'Mã TTHC'] = match.iloc[0]['maTTHC']
                        batch_df.at[idx, 'Đối tượng'] = match.iloc[0]['DoiTuong']
                        batch_df.at[idx, 'Lĩnh vực'] = match.iloc[0]['LinhVuc']
            except Exception as e:
                print(f"Error merging with DanhSachTTHC.csv: {e}")
            # Ensure all columns are included
            for col in all_columns:
                if col not in batch_df.columns:
                    batch_df[col] = ""
            batch_df = batch_df[all_columns]
            mode = 'a' if file_exists else 'w'
            header = not file_exists
            batch_df.to_csv(temp_csv, mode=mode, header=header, index=False)
            file_exists = True
            batch_data = []
    
    # Convert final CSV to Excel
    try:
        final_df = pd.read_csv(temp_csv)
        final_df.to_excel(output_file, index=False)
        print(f"Successfully exported data to {output_file}")
        
        # Remove temporary CSV file
        os.remove(temp_csv)
    except Exception as e:
        print(f"Error converting to Excel: {e}")
        print(f"Data saved in temporary CSV file: {temp_csv}")

# Main execution
if __name__ == "__main__":
    input_file = "danhsach2.csv"
    output_file = "Du lieu TTHC - more.xlsx"
    
    # Process URLs in batches of 20
    process_urls_incrementally(input_file, output_file, batch_size=20)
    