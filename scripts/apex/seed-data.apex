// AU rental demo data.
// Run with:  sf apex run --file scripts/apex/seed-data.apex
// Safe to re-run: removes previously seeded demo rows first.
// All people, phone numbers and emails are fictional (example.com / ACMA fictional number range).

// Demo rows are identified by the three landlord account names (long text fields such as
// Description cannot be used in a SOQL WHERE clause).
List<String> demoAccountNames = new List<String>{
    'Harbourview Property Holdings Pty Ltd',
    'Southern Cross Landlords Pty Ltd',
    'Bayside Investment Properties Pty Ltd'
};
delete [SELECT Id FROM Opportunity WHERE Account.Name IN :demoAccountNames];
delete [SELECT Id FROM Account WHERE Name IN :demoAccountNames];

Account harbourview = new Account(Name = demoAccountNames[0]);
Account southern    = new Account(Name = demoAccountNames[1]);
Account bayside     = new Account(Name = demoAccountNames[2]);
insert new List<Account>{ harbourview, southern, bayside };

List<Opportunity> opps = new List<Opportunity>();

// 1. NSW apartment - application received (clean, complete)
opps.add(new Opportunity(
    Name = 'Unit 4, 12 Wattle St, Newtown NSW - Priya Nair',
    AccountId = harbourview.Id,
    StageName = 'Qualification',
    CloseDate = Date.today().addDays(14),
    Property_Address__c = 'Unit 4, 12 Wattle Street',
    Property_Suburb__c = 'Newtown',
    Property_State__c = 'NSW',
    Property_Postcode__c = '2042',
    Property_Type__c = 'Apartment',
    Bedrooms__c = 2,
    Bathrooms__c = 1,
    Weekly_Rent__c = 720,
    Bond_Amount__c = 2880,
    Lease_Start_Date__c = Date.today().addDays(21),
    Lease_Term_Months__c = 12,
    Rent_Payment_Frequency__c = 'Weekly',
    Pets_Allowed__c = false,
    Special_Conditions__c = 'Rent to be paid by direct debit.\nTenant to arrange their own electricity account.',
    Tenant_Name__c = 'Priya Nair',
    Tenant_Email__c = 'priya.nair@example.com',
    Tenant_Phone__c = '0491 570 006',
    Amount = 720 * 52
));

// 2. VIC unit - lease offered (rent <= $900/wk and bond under one month: good for the VIC bond-cap demo)
opps.add(new Opportunity(
    Name = '5/48 Brunswick St, Fitzroy VIC - Liam Nguyen',
    AccountId = southern.Id,
    StageName = 'Proposal/Price Quote',
    CloseDate = Date.today().addDays(10),
    Property_Address__c = '5/48 Brunswick Street',
    Property_Suburb__c = 'Fitzroy',
    Property_State__c = 'VIC',
    Property_Postcode__c = '3065',
    Property_Type__c = 'Unit',
    Bedrooms__c = 1,
    Bathrooms__c = 1,
    Weekly_Rent__c = 520,
    Bond_Amount__c = 2080,
    Lease_Start_Date__c = Date.today().addDays(28),
    Lease_Term_Months__c = 12,
    Rent_Payment_Frequency__c = 'Fortnightly',
    Pets_Allowed__c = false,
    Special_Conditions__c = 'One allocated car space (Bay 5).',
    Tenant_Name__c = 'Liam Nguyen',
    Tenant_Email__c = 'liam.nguyen@example.com',
    Tenant_Phone__c = '0491 570 156',
    Amount = 520 * 52
));

// 3. QLD townhouse - out for signing, pets allowed
opps.add(new Opportunity(
    Name = '27 Jacaranda Ave, West End QLD - Hannah Wilson',
    AccountId = bayside.Id,
    StageName = 'Negotiation/Review',
    CloseDate = Date.today().addDays(5),
    Property_Address__c = '27 Jacaranda Avenue',
    Property_Suburb__c = 'West End',
    Property_State__c = 'QLD',
    Property_Postcode__c = '4101',
    Property_Type__c = 'Townhouse',
    Bedrooms__c = 3,
    Bathrooms__c = 2,
    Weekly_Rent__c = 850,
    Bond_Amount__c = 3400,
    Lease_Start_Date__c = Date.today().addDays(14),
    Lease_Term_Months__c = 12,
    Rent_Payment_Frequency__c = 'Weekly',
    Pets_Allowed__c = true,
    Special_Conditions__c = 'One small dog approved. Tenant to maintain the courtyard garden.',
    Tenant_Name__c = 'Hannah Wilson',
    Tenant_Email__c = 'hannah.wilson@example.com',
    Tenant_Phone__c = '0491 570 157',
    Amount = 850 * 52
));

// 4. WA house - early enquiry, deliberately incomplete (fill the gaps via the document)
opps.add(new Opportunity(
    Name = '8 Banksia Cl, Fremantle WA - Arjun Mehta',
    AccountId = southern.Id,
    StageName = 'Prospecting',
    CloseDate = Date.today().addDays(30),
    Property_Address__c = '8 Banksia Close',
    Property_Suburb__c = 'Fremantle',
    Property_State__c = 'WA',
    Property_Postcode__c = '6160',
    Property_Type__c = 'House',
    Bedrooms__c = 4,
    Bathrooms__c = 2,
    Weekly_Rent__c = 1050,
    Lease_Term_Months__c = 12,
    Rent_Payment_Frequency__c = 'Fortnightly',
    Tenant_Name__c = 'Arjun Mehta',
    Amount = 1050 * 52
));

// 5. NSW apartment - already leased (Closed Won): the document renders read-only
opps.add(new Opportunity(
    Name = 'Unit 9, 33 Harbour View Tce, Glebe NSW - Mei Lin Zhang',
    AccountId = harbourview.Id,
    StageName = 'Closed Won',
    CloseDate = Date.today().addDays(-10),
    Property_Address__c = 'Unit 9, 33 Harbour View Terrace',
    Property_Suburb__c = 'Glebe',
    Property_State__c = 'NSW',
    Property_Postcode__c = '2037',
    Property_Type__c = 'Apartment',
    Bedrooms__c = 2,
    Bathrooms__c = 1,
    Weekly_Rent__c = 780,
    Bond_Amount__c = 3120,
    Lease_Start_Date__c = Date.today().addDays(-30),
    Lease_Term_Months__c = 12,
    Rent_Payment_Frequency__c = 'Weekly',
    Pets_Allowed__c = false,
    Special_Conditions__c = 'Routine inspection every 6 months with 7 days written notice.',
    Tenant_Name__c = 'Mei Lin Zhang',
    Tenant_Email__c = 'meilin.zhang@example.com',
    Tenant_Phone__c = '0491 570 158',
    Amount = 780 * 52
));

insert opps;
System.debug('Seeded ' + opps.size() + ' demo opportunities.');
