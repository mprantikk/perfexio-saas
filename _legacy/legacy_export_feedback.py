import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd

# ১. ফায়ারবেসে কানেক্ট করুন (সার্ভিস কি ব্যবহার করে)
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

# ২. StagingFeedbacks কালেকশন থেকে ডাটা নিয়ে আসুন
docs = db.collection('StagingFeedbacks').stream()

feedback_list = []
for doc in docs:
    data = doc.to_dict()
    data['Feedback_Doc_ID'] = doc.id
    feedback_list.append(data)

# ৩. ডাটা জমা হয়ে থাকলে CSV ফাইল তৈরি করুন
if feedback_list:
    df = pd.DataFrame(feedback_list)
    df.to_csv('Staging_Tester_Feedbacks_Report.csv', index=False)
    print("\n✅ সফলভাবে 'Staging_Tester_Feedbacks_Report.csv' ফাইলে ফিডব্যাক রিপোর্ট তৈরি হয়েছে!\n")
else:
    print("\n⚠️ ডাটাবেজে এখনো কোনো স্ট্রেজিং ফিডব্যাক ডাটা জমা হয়নি।\n")