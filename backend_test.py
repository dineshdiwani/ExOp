import requests
import sys
import json
from datetime import datetime

class ExpertOpinionAPITester:
    def __init__(self, base_url="https://expert-marketplace-11.preview.emergentagent.com"):
        self.base_url = base_url
        self.client_token = None
        self.expert_token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_data = {}

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.json()}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_auth_flow(self):
        """Test authentication endpoints"""
        print("\n" + "="*50)
        print("TESTING AUTHENTICATION")
        print("="*50)
        
        # Test client login (users already exist)
        success, response = self.run_test(
            "Client Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "testclient2@example.com", "password": "password123"}
        )
        if success and 'access_token' in response:
            self.client_token = response['access_token']
            self.test_data['client_user'] = response['user']
            print(f"   Client token obtained: {self.client_token[:20]}...")

        # Test expert login
        success, response = self.run_test(
            "Expert Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "testexpert@example.com", "password": "password123"}
        )
        if success and 'access_token' in response:
            self.expert_token = response['access_token']
            self.test_data['expert_user'] = response['user']
            print(f"   Expert token obtained: {self.expert_token[:20]}...")

        # Test admin login (using provided credentials)
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@expertopinion.com", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")

        # Test /me endpoint
        if self.client_token:
            self.run_test(
                "Get Current User (Client)",
                "GET",
                "api/auth/me",
                200,
                token=self.client_token
            )
        
        if self.expert_token:
            self.run_test(
                "Get Current User (Expert)",
                "GET",
                "api/auth/me",
                200,
                token=self.expert_token
            )

    def test_categories_and_cities(self):
        """Test categories and cities endpoints"""
        print("\n" + "="*50)
        print("TESTING CATEGORIES & CITIES")
        print("="*50)
        
        self.run_test(
            "Get Categories",
            "GET",
            "api/categories",
            200
        )
        
        self.run_test(
            "Get Cities",
            "GET",
            "api/cities",
            200
        )

    def test_issue_flow(self):
        """Test issue creation and management"""
        print("\n" + "="*50)
        print("TESTING ISSUE MANAGEMENT")
        print("="*50)
        
        if not self.client_token:
            print("❌ Skipping issue tests - no client token")
            return
        
        # Create issue
        issue_data = {
            "title": "Need legal advice for property dispute",
            "description": "I have a property dispute with my neighbor regarding boundary issues. Need expert legal consultation.",
            "category": "legal",
            "city": "Mumbai",
            "budget_min": 1000,
            "budget_max": 3000,
            "urgency": "normal"
        }
        
        success, response = self.run_test(
            "Create Issue",
            "POST",
            "api/issues",
            200,
            data=issue_data,
            token=self.client_token
        )
        if success and 'issue_id' in response:
            self.test_data['issue_id'] = response['issue_id']
            print(f"   Issue created: {self.test_data['issue_id']}")
        
        # List issues
        self.run_test(
            "List Issues",
            "GET",
            "api/issues",
            200
        )
        
        # Get specific issue
        if 'issue_id' in self.test_data:
            self.run_test(
                "Get Issue Details",
                "GET",
                f"api/issues/{self.test_data['issue_id']}",
                200
            )
        
        # Get my issues
        self.run_test(
            "Get My Issues",
            "GET",
            "api/issues/my/list",
            200,
            token=self.client_token
        )

    def test_offer_flow(self):
        """Test offer creation and management"""
        print("\n" + "="*50)
        print("TESTING OFFER MANAGEMENT")
        print("="*50)
        
        if not self.expert_token or 'issue_id' not in self.test_data:
            print("❌ Skipping offer tests - no expert token or issue")
            return
        
        # Create offer
        offer_data = {
            "issue_id": self.test_data['issue_id'],
            "price": 2000,
            "message": "I am an experienced legal expert with 10+ years in property law. I can help resolve your boundary dispute.",
            "available_slots": [
                {"date": "2024-12-20", "start_time": "10:00", "end_time": "11:00"},
                {"date": "2024-12-21", "start_time": "14:00", "end_time": "15:00"}
            ]
        }
        
        success, response = self.run_test(
            "Create Offer",
            "POST",
            "api/offers",
            200,
            data=offer_data,
            token=self.expert_token
        )
        if success and 'offer_id' in response:
            self.test_data['offer_id'] = response['offer_id']
            print(f"   Offer created: {self.test_data['offer_id']}")
        
        # Get my offers
        self.run_test(
            "Get My Offers",
            "GET",
            "api/offers/my/list",
            200,
            token=self.expert_token
        )

    def test_booking_flow(self):
        """Test booking creation and management"""
        print("\n" + "="*50)
        print("TESTING BOOKING MANAGEMENT")
        print("="*50)
        
        if not self.client_token or 'offer_id' not in self.test_data:
            print("❌ Skipping booking tests - no client token or offer")
            return
        
        # Create booking
        booking_data = {
            "offer_id": self.test_data['offer_id'],
            "selected_slot": {"date": "2024-12-20", "start_time": "10:00", "end_time": "11:00"}
        }
        
        success, response = self.run_test(
            "Create Booking",
            "POST",
            "api/bookings",
            200,
            data=booking_data,
            token=self.client_token
        )
        if success and 'booking_id' in response:
            self.test_data['booking_id'] = response['booking_id']
            print(f"   Booking created: {self.test_data['booking_id']}")
        
        # Get bookings
        self.run_test(
            "Get Client Bookings",
            "GET",
            "api/bookings",
            200,
            token=self.client_token
        )
        
        self.run_test(
            "Get Expert Bookings",
            "GET",
            "api/bookings",
            200,
            token=self.expert_token
        )
        
        # Get specific booking
        if 'booking_id' in self.test_data:
            self.run_test(
                "Get Booking Details",
                "GET",
                f"api/bookings/{self.test_data['booking_id']}",
                200,
                token=self.client_token
            )

    def test_payment_flow(self):
        """Test payment endpoints (mocked)"""
        print("\n" + "="*50)
        print("TESTING PAYMENT FLOW (MOCKED)")
        print("="*50)
        
        if not self.client_token or 'booking_id' not in self.test_data:
            print("❌ Skipping payment tests - no client token or booking")
            return
        
        # Create payment order
        success, response = self.run_test(
            "Create Payment Order",
            "POST",
            "api/payments/create-order",
            200,
            data={"booking_id": self.test_data['booking_id']},
            token=self.client_token
        )
        if success and 'order_id' in response:
            order_id = response['order_id']
            print(f"   Payment order created: {order_id}")
            
            # Verify payment (mocked)
            self.run_test(
                "Verify Payment (Mocked)",
                "POST",
                "api/payments/verify",
                200,
                data={
                    "order_id": order_id,
                    "razorpay_payment_id": f"pay_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "razorpay_signature": "mock_signature"
                },
                token=self.client_token
            )

    def test_chat_flow(self):
        """Test chat functionality"""
        print("\n" + "="*50)
        print("TESTING CHAT FUNCTIONALITY")
        print("="*50)
        
        if not self.client_token or not self.expert_token or 'booking_id' not in self.test_data:
            print("❌ Skipping chat tests - missing tokens or booking")
            return
        
        # Send message from client
        success, response = self.run_test(
            "Send Chat Message (Client)",
            "POST",
            "api/chat/messages",
            200,
            data={
                "booking_id": self.test_data['booking_id'],
                "content": "Hello, I need help with my property dispute case."
            },
            token=self.client_token
        )
        
        # Send message from expert
        self.run_test(
            "Send Chat Message (Expert)",
            "POST",
            "api/chat/messages",
            200,
            data={
                "booking_id": self.test_data['booking_id'],
                "content": "Hello! I've reviewed your case. Let me help you understand your options."
            },
            token=self.expert_token
        )
        
        # Get chat messages
        self.run_test(
            "Get Chat Messages",
            "GET",
            f"api/chat/messages/{self.test_data['booking_id']}",
            200,
            token=self.client_token
        )

    def test_admin_endpoints(self):
        """Test admin functionality"""
        print("\n" + "="*50)
        print("TESTING ADMIN FUNCTIONALITY")
        print("="*50)
        
        if not self.admin_token:
            print("❌ Skipping admin tests - no admin token")
            return
        
        # Get admin stats
        self.run_test(
            "Get Admin Stats",
            "GET",
            "api/admin/stats",
            200,
            token=self.admin_token
        )
        
        # Get all users
        self.run_test(
            "Get All Users",
            "GET",
            "api/admin/users",
            200,
            token=self.admin_token
        )
        
        # Get pending experts
        self.run_test(
            "Get Pending Experts",
            "GET",
            "api/admin/experts/pending",
            200,
            token=self.admin_token
        )
        
        # Get disputes
        self.run_test(
            "Get Disputes",
            "GET",
            "api/admin/disputes",
            200,
            token=self.admin_token
        )

    def test_expert_endpoints(self):
        """Test expert-specific endpoints"""
        print("\n" + "="*50)
        print("TESTING EXPERT ENDPOINTS")
        print("="*50)
        
        # List experts (public)
        self.run_test(
            "List Experts (Public)",
            "GET",
            "api/experts",
            200
        )
        
        if self.expert_token:
            # Get user profile
            self.run_test(
                "Get Expert Profile",
                "GET",
                "api/users/profile",
                200,
                token=self.expert_token
            )

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting ExpertOpinion API Tests")
        print(f"📍 Testing against: {self.base_url}")
        
        try:
            self.test_auth_flow()
            self.test_categories_and_cities()
            self.test_issue_flow()
            self.test_offer_flow()
            self.test_booking_flow()
            self.test_payment_flow()
            self.test_chat_flow()
            self.test_expert_endpoints()
            self.test_admin_endpoints()
            
        except Exception as e:
            print(f"\n❌ Test suite failed with error: {str(e)}")
        
        # Print final results
        print("\n" + "="*60)
        print("FINAL TEST RESULTS")
        print("="*60)
        print(f"📊 Tests passed: {self.tests_passed}/{self.tests_run}")
        print(f"📈 Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed")
            return 1

def main():
    tester = ExpertOpinionAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())