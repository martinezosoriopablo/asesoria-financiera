import os
from playwright.sync_api import sync_playwright

test_email = os.environ.get('TEST_EMAIL', '')
test_password = os.environ.get('TEST_PASSWORD', '')

if not test_email or not test_password:
    print('❌ Set TEST_EMAIL and TEST_PASSWORD environment variables')
    exit(1)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    page = context.new_page()

    # First login
    page.goto('http://localhost:3000/login')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='/tmp/fortt-01-login.png')

    # Fill login credentials
    email_input = page.locator('input[type="email"]')
    if email_input.count() > 0:
        email_input.fill(test_email)
        password_input = page.locator('input[type="password"]')
        password_input.fill(test_password)
        # Click submit
        submit = page.locator('button[type="submit"]')
        submit.click()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

    page.screenshot(path='/tmp/fortt-02-after-login.png')

    # Navigate to Fortt's seguimiento page
    # Client ID: 0f0e0931-977f-4e1f-b506-d3a120e06124
    page.goto('http://localhost:3000/clients/0f0e0931-977f-4e1f-b506-d3a120e06124/seguimiento')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)

    page.screenshot(path='/tmp/fortt-03-seguimiento-top.png', full_page=False)

    # Scroll down to see more
    page.evaluate('window.scrollBy(0, 800)')
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/fortt-04-seguimiento-mid.png', full_page=False)

    # Scroll more to see holdings
    page.evaluate('window.scrollBy(0, 800)')
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/fortt-05-seguimiento-holdings.png', full_page=False)

    # Scroll more
    page.evaluate('window.scrollBy(0, 800)')
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/fortt-06-seguimiento-bottom.png', full_page=False)

    browser.close()
    print("Done - screenshots saved to /tmp/fortt-*.png")
